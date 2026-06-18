# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介
CMPak（辛姆巴科）同声传译 App——实时中文语音识别 + DeepSeek 英文翻译，用于公司内部会议。

## 运行方式
```bash
pip install fastapi uvicorn openai
uvicorn main:app --reload
```
本地访问：`http://localhost:8000`（展示页）、`http://localhost:8000/admin`（管理后台）

## 部署信息
- **线上地址**：https://interpreter-app-0x0c.onrender.com
- **管理后台**：https://interpreter-app-0x0c.onrender.com/admin
- **平台**：Render.com 免费套餐，连接 GitHub 主分支自动部署（有时需手动触发）
- **GitHub**：https://github.com/huwenxiaocursor/interpreter-app

## 环境变量（在 Render 控制台配置）
- `DEEPSEEK_API_KEY`：翻译接口
- `OPENAI_API_KEY`：已配置备用（Whisper 方案，当前未启用）

## 架构
- `main.py`：FastAPI 后端，提供 `/api/translate`、`/api/transcribe`（备用）、`/api/config`、`/api/upload-logo`
- `static/display.html`：演讲者/听众展示页
- `static/admin.html`：管理后台（设置部门、标语、Logo）
- `static/app.js`：前端逻辑（语音识别、翻译流、动画）
- `static/style.css`：样式

## 核心流程
1. 浏览器 Web Speech API 识别中文语音（`continuous=true`）
2. 识别结果立刻显示在屏幕（灰色小字）
3. 同时调用 `/api/translate` → DeepSeek 流式返回英文翻译追加在下方

## 浏览器兼容
- **Safari（推荐）**：用 Apple 语音引擎，在巴基斯坦网络稳定，`interimResults` 已关闭
- **Chrome**：用 Google 语音引擎，需能访问 Google 服务器；且需在 Chrome 站点麦克风设置中选 `MacBook Air麦克风 (Built-in)`，不能选 BlackHole

## 已知问题与解决方案
- **识别出乱内容**：检查 macOS 音频输出是否被设为 BlackHole（虚拟音频）。BlackHole 会将系统音频回环进麦克风。解决：将音频输出改回 MacBook Air 扬声器。
- **Chrome 无响应**：Chrome 网站麦克风设备选了 BlackHole 而非物理麦克风，改回 Built-in 即可。
- **Render 未自动更新**：在 Render 控制台手动点 Manual Deploy → Deploy latest commit。
- **首次访问慢**：Render 免费套餐闲置后休眠，首次请求需约30秒唤醒。

## 用户信息
- 使用者：胡文潇，CMPak 战略部副总经理，在巴基斯坦办公
- 设备：MacBook Air，安装了 BlackHole 2ch 和 ZoomAudioDevice 虚拟音频设备
