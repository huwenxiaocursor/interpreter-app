import json
import os
import shutil
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
STATIC_DIR  = os.path.join(BASE_DIR, "static")

os.makedirs(UPLOADS_DIR, exist_ok=True)

DEFAULT_CONFIG = {"logo": None, "active_department": None, "departments": []}


def read_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_CONFIG.copy()


def write_config(cfg: dict) -> None:
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/static",  StaticFiles(directory=STATIC_DIR),  name="static")


@app.get("/")
@app.get("/display")
async def display():
    return FileResponse(os.path.join(STATIC_DIR, "display.html"))


@app.get("/admin")
async def admin():
    return FileResponse(os.path.join(STATIC_DIR, "admin.html"))


@app.get("/api/config")
async def get_config():
    return read_config()


class DeptItem(BaseModel):
    name: str
    banner: str


class ConfigBody(BaseModel):
    logo: Optional[str] = None
    active_department: Optional[str] = None
    departments: list[DeptItem] = []


@app.post("/api/config")
async def save_config(body: ConfigBody):
    write_config(body.model_dump())
    return {"status": "ok"}


@app.post("/api/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        raise HTTPException(400, "不支持的文件格式，请上传 PNG / JPG / GIF / WebP / SVG")
    filename = f"logo{ext}"
    dest = os.path.join(UPLOADS_DIR, filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": f"/uploads/{filename}"}



@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(500, "服务器未配置 OPENAI_API_KEY 环境变量")

    content = await audio.read()
    if len(content) < 500:
        return {"text": ""}

    import tempfile
    suffix = os.path.splitext(audio.filename or "chunk.webm")[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        client = OpenAI(api_key=api_key)
        with open(tmp_path, "rb") as f:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language="zh",
            )
        return {"text": transcript.text}
    except Exception as e:
        raise HTTPException(500, f"语音识别失败：{e}")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


class TranslateRequest(BaseModel):
    text: str


@app.post("/api/translate")
async def translate(req: TranslateRequest):
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(500, "服务器未配置 DEEPSEEK_API_KEY 环境变量")

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

    def token_stream():
        stream = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional simultaneous interpreter for CMPak "
                        "(China Mobile Pakistan). The input is Chinese speech (may be "
                        "Simplified or Traditional Chinese). Translate it to fluent, "
                        "professional English. Output ONLY the translated English text, "
                        "nothing else."
                    ),
                },
                {"role": "user", "content": req.text},
            ],
            stream=True,
            max_tokens=512,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    return StreamingResponse(token_stream(), media_type="text/plain; charset=utf-8")
