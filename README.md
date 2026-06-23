# CMPak 同声传译系统

> 专为 CMPak（中国移动巴基斯坦）内部会议设计的实时中英同声传译 Web 应用。

**线上地址**：https://interpreter-app-0x0c.onrender.com  
**管理后台**：https://interpreter-app-0x0c.onrender.com/admin

---

## 功能特性

- **实时语音识别**：利用浏览器原生 Web Speech API 识别普通话（连续识别模式）
- **流式翻译输出**：调用 DeepSeek API 将中文实时翻译为专业英文，逐字流式显示
- **展示页**：顶部横幅显示欢迎语与部门名称，右上角展示公司 Logo，适合投屏给听众
- **管理后台**：可在线配置部门列表、欢迎标语、当前演讲部门及公司 Logo，无需重启服务
- **Safari / Chrome 双端适配**：Safari 推荐（苹果语音引擎，在巴基斯坦网络更稳定）

---

## 系统架构

```
浏览器（演讲者）
  │
  ├─ Web Speech API ──→ 中文识别文字
  │
  └─ POST /api/translate ──→ FastAPI 后端
                                │
                                └─ DeepSeek API（流式）──→ 英文翻译逐字返回浏览器
```

### 文件结构

```
interpreter-app/
├── main.py              # FastAPI 后端
├── config.json          # 运行时配置（部门、Logo）
├── requirements.txt
└── static/
    ├── display.html     # 展示页（演讲 + 投屏）
    ├── admin.html       # 管理后台
    ├── app.js           # 前端逻辑（语音识别、翻译流、动画）
    └── style.css        # 样式
```

---

## 本地运行

**前置要求**：Python 3.10+，已配置 `DEEPSEEK_API_KEY` 环境变量

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 设置 API Key
export DEEPSEEK_API_KEY=your_key_here

# 3. 启动服务
uvicorn main:app --reload
```

| 地址 | 说明 |
|------|------|
| http://localhost:8000 | 展示页（演讲 + 投屏） |
| http://localhost:8000/admin | 管理后台 |

---

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | 是 | 用于调用 DeepSeek 翻译接口 |
| `OPENAI_API_KEY` | 否 | 预留，用于 Whisper 语音识别备用方案（当前未启用） |

---

## 部署（Render.com）

本项目已部署在 [Render.com](https://render.com) 免费套餐，连接 GitHub 主分支自动部署。

**注意事项**：
- 免费套餐闲置约 15 分钟后休眠，首次访问需约 30 秒唤醒
- 代码推送后有时需在 Render 控制台手动触发 **Manual Deploy → Deploy latest commit**

**Render 环境变量配置路径**：Dashboard → 选择服务 → Environment → 添加 `DEEPSEEK_API_KEY`

---

## 浏览器兼容

| 浏览器 | 支持情况 | 备注 |
|--------|----------|------|
| Safari | 推荐 | Apple 语音引擎，巴基斯坦网络下稳定 |
| Chrome | 支持 | 需能访问 Google 服务器；麦克风设备须选 Built-in，不能选 BlackHole |
| Firefox | 不支持 | 不支持 Web Speech API |

---

## 常见问题

**Q：识别出乱码或无关内容**  
A：检查 macOS 系统音频输出是否被设为 BlackHole（虚拟音频）。BlackHole 会将系统声音回环进麦克风。解决方法：将音频输出改回 MacBook Air 扬声器。

**Q：Chrome 下点击开始后无响应**  
A：进入 Chrome 网站麦克风设置，将音频输入设备改为 `MacBook Air麦克风 (Built-in)`，不能选 BlackHole。

**Q：Render 更新后线上版本未变化**  
A：在 Render 控制台手动点击 Manual Deploy → Deploy latest commit。

---

## 技术栈

- **后端**：Python · FastAPI · Uvicorn
- **语音识别**：浏览器 Web Speech API（`SpeechRecognition`）
- **翻译**：DeepSeek Chat API（`deepseek-chat` 模型，流式输出）
- **前端**：原生 HTML / CSS / JavaScript（无框架依赖）
- **部署**：Render.com
