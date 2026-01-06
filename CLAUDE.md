# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发规范

- 你是一个专业的全栈开发，会在必要时补充注释
- 代码遵循 SOLID 原则

## 项目概述

FunASR Audio Editor - 基于 FunASR 的中文语音转文字编辑器，支持说话人识别、热词配置、智能分段等功能。

## 技术栈

- **后端**: Python Flask + FunASR (阿里巴巴开源语音识别模型)
- **前端**: 原生 HTML/CSS/JavaScript（单页应用，无构建工具）
- **存储**: LocalStorage（客户端缓存）+ 服务端文件缓存

## 启动命令

```bash
# 启动服务器（默认端口 8082）
python app.py
```

访问 `http://localhost:8082`

## 项目结构

```
├── app.py              # Flask 后端主文件（ASR API、素材库管理）
├── static/index.html   # 完整前端（HTML+CSS+JS，约2300行）
├── result/             # 识别结果保存目录（JSON）
└── ~/funasr_server/    # 服务端数据目录
    ├── materials/      # 素材库文件
    └── cache/          # 服务端缓存
```

## 核心架构

### 后端 API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/asr` | POST | 语音识别（支持文件上传或素材库选择） |
| `/materials` | GET | 获取素材库列表 |
| `/materials/<filename>` | GET | 下载素材文件 |
| `/admin/upload` | POST | 上传素材（需密码） |
| `/admin/delete/<filename>` | DELETE | 删除素材（需密码） |
| `/server-status` | GET | 服务器状态（排队/处理中） |

### ASR 请求流程

```
前端 POST /asr (FormData: audio/material_name, enable_advanced, hotwords)
    ↓
后端检查缓存 → 获取模型锁 → FunASR 识别 → 保存结果 → 返回 JSON
    ↓
前端 LocalStorage 缓存 + 渲染编辑界面
```

### 线程模型

- `basic_model_lock` / `advanced_model_lock`：防止模型并发访问
- 请求计数器跟踪等待/处理状态

### 前端编辑功能

- **编辑模式**: 段落级编辑、字符级编辑（带时间戳）
- **显示模式**: 连续、逐行、智能分段
- **特色功能**: 拖拽排序、右键删除、口癖搜索删除、说话人高亮、播放同步高亮

## 注意事项

- `~/` 路径需使用 `os.path.expanduser()` 展开
- 前端所有功能集中在 `static/index.html`，修改时注意代码量较大
- 管理员密码硬编码在 `app.py` 中（`ADMIN_PASSWORD`）
