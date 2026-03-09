# CLAUDE.md

为 Claude Code (claude.ai/code) 提供本项目的开发指导。

## 开发规范

你是一个资深全栈工程师，同时拥有良好的产品sense。写的代码倾向于模块化，严谨且易维护，在必要时候会补充注释。
每当你进行一个功能开发的时候，你会同步补充到相关的MD文档中，包括工作流程和技术细节。
当彻底完成某一个功能时，规划一个详尽的测试用例并执行，输出一个细致的测试报告，在遇到问题的时候直接尝试修复。
当你犯错的时候，你会记录到CLAUDE.MD中，避免重复犯错。有时候用户的表达会不太明确，在需要的时候，一定先和用户确认好需求再开始做改动。

请始终使用第一性原理思考。你不能总是假设我非常清楚自己想要什么和该怎么得到。请保持审慎，从原始需求和问题出发，如果动机和目标不清晰，停下来和我讨论。如果目标清晰但是路径不是最短，告诉我，并且建议更好的办法。

## 项目概述

VoxFlow - 基于文本的多模态编辑器。使用 FunASR 中文语音识别引擎，支持音频/视频上传、说话人识别、热词配置、智能分段、LLM 辅助编辑等功能。

## 技术栈

- **后端**: Python Flask + FunASR (阿里巴巴开源语音识别模型) + DeepSeek LLM
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS v4 + Zustand
- **存储**: LocalStorage（客户端缓存）+ 服务端文件缓存

## 启动命令

```bash
# 后端一键启动（自动激活 venv，若 .venv 不存在会自动创建并安装依赖）
./start.sh

# 或手动启动：
source .venv/bin/activate        # 激活虚拟环境（Python 3.11）
pip install -r requirements.txt  # 首次安装后端依赖
python app.py                    # 启动后端服务器（默认端口 8082）

# 前端：
npm install    # 安装依赖
npm run dev    # 开发模式（热更新）
npm run build  # 构建生产版本
```

访问 `http://localhost:8082`（生产）或 `http://localhost:3001`（开发）

## 项目结构

```
├── app.py                  # Flask 入口（创建 app、注册 Blueprint、静态文件）
├── config.py               # 全局配置（常量、目录、共享状态、并发控制）
├── requirements.txt        # Python 后端依赖
├── routes/                 # Flask Blueprint 路由
│   ├── asr.py              # /asr, /health, /server-status
│   ├── chat.py             # /chat, /generate-cover
│   ├── materials.py        # /materials/*, /admin/*
│   ├── media.py            # /export-media, /export-download
│   └── tts.py              # /tts
├── services/               # 后端服务层
│   ├── asr_service.py      # FunASR 模型初始化、缓存
│   ├── media_service.py    # FFmpeg 操作
│   └── tts_service.py      # TTS 参考音频处理
├── src/                    # React 前端源码
│   ├── components/         # UI 组件
│   │   ├── audio/          # 音频相关（AudioPlayer, FileSelector, RecognitionSettings）
│   │   ├── chat/           # LLM 聊天（ChatPanel, ChatInput, ChatMessage, FillerAnalysis, PolishAnalysis）
│   │   ├── common/         # 通用组件（Button, Modal, ContextMenu, LoadingSpinner）
│   │   ├── layout/         # 布局（MainLayout, Header, Card）
│   │   ├── media/          # 媒体播放器（MediaPlayer - 支持音频/视频）
│   │   ├── modals/         # 弹窗（MaterialsModal, AdminModal）
│   │   └── result/         # 识别结果展示（ResultCard, SentenceSpan, ParagraphGroup, SegmentsTable）
│   ├── hooks/              # 自定义 Hooks
│   │   ├── useASRRecognition.ts  # ASR 识别逻辑
│   │   ├── useHighlight.ts       # 播放高亮同步
│   │   ├── useEditedPlayback.ts  # 编辑后播放
│   │   ├── useComposition.ts     # 编辑组合
│   │   └── ...
│   ├── stores/             # Zustand 状态管理
│   │   ├── asrStore.ts     # ASR 状态（文件、识别模式、热词）
│   │   ├── editorStore.ts  # 编辑器状态（segments、composition、说话人）
│   │   └── uiStore.ts      # UI 状态（主题、右键菜单）
│   ├── services/           # API 服务
│   │   ├── asrService.ts       # ASR 识别 API
│   │   ├── chatService.ts      # LLM 对话 API（SSE 流式）
│   │   └── materialsService.ts # 素材库 API
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 工具函数
├── dist/                   # 构建输出（生产环境）
├── result/                 # 识别结果保存目录（JSON）
└── ~/funasr_server/        # 服务端数据目录
    ├── materials/          # 素材库文件
    └── cache/              # 服务端缓存
```

## 核心架构

### 后端 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/asr` | POST | 语音识别（支持音频/视频上传，视频自动提取音频） |
| `/chat` | POST | LLM 对话（SSE 流式响应） |
| `/generate-cover` | POST | 生成视频封面（调用 nano-banana-pro，需 bsk- API key） |
| `/materials` | GET | 获取素材库列表 |
| `/materials/<filename>` | GET | 下载素材文件 |
| `/admin/upload` | POST | 上传素材（需密码） |
| `/admin/delete/<filename>` | DELETE | 删除素材（需密码） |
| `/server-status` | GET | 服务器状态（排队/处理中） |
| `/export-media` | POST | 导出编辑后的音视频（FFmpeg 精确切割拼接） |
| `/export-download/<task_id>` | GET | 下载大文件导出结果 |

### ASR 请求流程

```
前端 POST /asr (FormData: audio/video/material_name, enable_advanced, hotwords)
    ↓
后端检测文件类型 → 视频则用 ffmpeg 提取音频
    ↓
检查缓存 → 获取模型锁 → FunASR 识别 → 保存结果 → 返回 JSON
    ↓
前端 LocalStorage 缓存 + Zustand 状态更新 + 渲染编辑界面
```

### 前端状态管理 (Zustand)

- **asrStore**: 文件状态、识别模式、热词、服务器状态
- **editorStore**: 识别结果、composition 数组、说话人映射/合并、编辑状态
- **uiStore**: 主题、右键菜单、模态框状态

### 前端编辑功能

- **编辑模式**: 段落级编辑、逐字编辑（带时间戳）
- **显示模式**: 连续、逐行、智能分段
- **说话人功能**: 颜色高亮、右键编辑名称、合并说话人
- **特色功能**: 拖拽排序、右键删除、口癖搜索删除、播放同步高亮

### LLM 辅助功能

- **快速删除口癖**: AI 分析填充词并批量删除
- **快速润色**: AI 识别同音字错误并提供修正建议
- **生成封面**: AI 生成 B 站视频封面（调用 nano-banana-pro 图像模型）
- **概括总结**: 对识别内容进行总结
- **自由对话**: 支持任意问答

## 注意事项

- `~/` 路径需使用 `os.path.expanduser()` 展开
- 视频音频提取输出到 `/tmp` 目录，避免污染素材库
- LLM 对话使用 SSE 流式响应，前端有 60 秒超时保护
- 管理员密码硬编码在 `app.py` 中（`ADMIN_PASSWORD`）
- **新增后端 API 时，必须同时更新 `vite.config.js` 的 proxy 配置**，否则开发模式下前端请求会返回 404（Vite 开发服务器不认识未配置的路由）

## 延伸阅读

- [README.md](README.md) - 项目简介和快速开始
- [src/components/README.md](src/components/README.md) - React 组件结构和用法
- [STORE_ARCHITECTURE.md](STORE_ARCHITECTURE.md) - Zustand Store 架构和数据流
- [docs/BILIBILI_LLM_API.md](docs/BILIBILI_LLM_API.md) - B站 LLM API 集成指南（API Key 权限、图像生成响应处理）
