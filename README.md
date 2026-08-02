# VoxFlow

基于文本的多模态编辑器。使用 FunASR 中文语音识别引擎，支持音频/视频上传、说话人识别、智能分段、LLM 辅助编辑等功能。

## 功能特性

### 语音识别
- 支持音频文件（mp3, wav, flac, m4a 等）
- 支持视频文件（mp4, mkv, avi, mov 等），自动提取音频
- 支持热词配置，提升专业术语识别准确率
- 支持说话人识别（Speaker Diarization）
- 服务端缓存，相同文件无需重复识别

### 编辑功能
- **显示模式**：连续显示、逐行显示、智能分段
- **编辑模式**：段落级编辑、逐字编辑（保留时间戳）
- **说话人管理**：颜色高亮、编辑名称、合并说话人
- **拖拽排序**：自由调整语句顺序
- **口癖删除**：搜索并批量删除填充词
- **播放同步**：点击文字跳转播放，播放时高亮当前语句

### LLM 辅助
- **快速删除口癖**：AI 分析并批量删除无意义填充词
- **快速润色**：AI 识别同音字错误并提供修正建议
- **概括总结**：对识别内容进行智能总结
- **自由对话**：支持任意问答

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python Flask + FunASR + DeepSeek LLM |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| 状态管理 | Zustand + Immer |
| 音频处理 | ffmpeg（视频音频提取） |

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 18+
- ffmpeg（用于视频处理）

### 安装依赖

```bash
# 配置环境变量（API Key / 服务地址，模板见 .env.example）
cp .env.example .env

# 前端依赖
npm install

# Python 依赖（建议使用虚拟环境，Python 3.11）
pip install flask funasr modelscope
```

> 所有密钥与外部服务地址（LLM、图像生成、TTS）统一在 `.env` 中配置，
> `.env` 已被 `.gitignore` 忽略，请勿提交。

### 启动服务

```bash
# 启动后端（默认端口 8082）
python app.py

# 开发模式（前端热更新，端口 5173）
npm run dev

# 或构建生产版本
npm run build
```

访问 `http://localhost:8082`

## 项目结构

```
├── app.py              # Flask 后端
├── src/                # React 前端源码
│   ├── components/     # UI 组件
│   ├── hooks/          # 自定义 Hooks
│   ├── stores/         # Zustand 状态管理
│   ├── services/       # API 服务
│   └── types/          # TypeScript 类型
├── dist/               # 构建输出
└── result/             # 识别结果保存
```

## 文档

- [组件文档](src/components/README.md) - React 组件结构和用法
- [Store 架构](STORE_ARCHITECTURE.md) - 状态管理设计
- [开发指南](CLAUDE.md) - 项目开发规范和架构说明

## License

MIT
