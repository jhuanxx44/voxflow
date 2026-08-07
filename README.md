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

## Headless CLI / MCP

VoxFlow 现在同时提供确定性的 Headless 编辑内核。Codex、Claude 或脚本负责理解编辑意图，VoxFlow 负责项目持久化、识别、Edit Plan 校验、revision、FFmpeg 渲染和 artifact 管理。

### 安装 CLI

Headless 工具固定使用 Python 3.11，依赖按 extras 分离。默认 `make install-local` 安装完整本地识别能力；不需要 ASR 时可使用轻量目标避免安装 Torch。

```bash
# 开发环境（包含现有 Web、FunASR、MCP 和测试依赖）
make sync

# 安装可从任意目录调用的 CLI + MCP + 本地 FunASR
make install-local

# 可选：仅安装 transcript import / 编辑 / 导出能力，不安装 Torch/FunASR
make install-local-lite

command -v voxflow
voxflow --json doctor
```

默认项目数据位于系统应用数据目录，可用 `VOXFLOW_HOME=/path` 覆盖。

可用 `VOXFLOW_ALLOWED_INPUT_ROOTS=/media:/another/root` 限制 CLI/MCP 可导入的本地目录；路径会先解析 realpath，因此指向根目录外的 symlink 也会被拒绝。媒体大小、时长和导出超时还可分别通过 `VOXFLOW_MAX_INPUT_BYTES`、`VOXFLOW_MAX_MEDIA_DURATION_MS`、`VOXFLOW_EXPORT_TIMEOUT_SECONDS` 配置。ASR 缓存按源文件 SHA-256、provider、模型和 hotwords 内容寻址，存放在 `VOXFLOW_HOME/asr-cache/`。

### Agent 工作流

```bash
# 1. 导入媒体
voxflow --json project create /absolute/path/input.mp4 --name "访谈粗剪"

# 2. 识别并等待完成
voxflow --json transcript start <project-id> --model advanced --wait

# 3. 分页读取/搜索稳定 IDs
voxflow --json transcript search <project-id> "就是说" --context 2
voxflow --json timeline get <project-id> --limit 100

# 4. 所有写入先 preview，再 apply
voxflow --json edit preview <project-id> --plan /absolute/path/edit-plan.json
voxflow --json edit apply <project-id> --plan /absolute/path/edit-plan.json

# 5. 导出
voxflow --json export create <project-id> --format mp4 \
  --out /absolute/path/edited.mp4 --wait
```

Edit Plan 使用稳定 `clip_*` / `tok_*` ID、当前 `expected_revision` 和唯一 `client_request_id`。文本搜索只发现候选，不直接执行模糊删除。完整 schema 位于 `voxflow/schemas/`。

`edit-plan.json` 示例（其中 ID 必须来自当前 `timeline get` / `transcript search`，不要手写猜测）：

```json
{
  "schema_version": 1,
  "project_id": "prj_...",
  "expected_revision": 1,
  "client_request_id": "codex-edit-20260805-001",
  "reason": "删除开场并缩短第二段",
  "operations": [
    {"op": "delete_clips", "clip_ids": ["clip_..."]},
    {
      "op": "trim_clip",
      "clip_id": "clip_...",
      "source_in_ms": 1250,
      "source_out_ms": 4800
    }
  ]
}
```

同一计划必须先 `edit preview`，确认 diff 后再 `edit apply`。如果 revision 已变化，重新读取 timeline 并生成新计划；不要修改原请求后复用同一个 `client_request_id`。

### MCP 配置

stdio MCP server 命令：

```bash
voxflow mcp serve
```

Codex 配置示例：

```toml
[mcp_servers.voxflow]
command = "voxflow"
args = ["mcp", "serve"]
env = { VOXFLOW_HOME = "/absolute/path/to/voxflow-data" }
```

MCP 对长任务使用 `transcript_start` / `export_start` 返回 job ID，再用 `job_get` 轮询；媒体内容不会通过 MCP 返回，只提供本地 artifact 路径。

### 开发验证

```bash
make check
python3.11 scripts/smoke_cli.py
uv run python scripts/smoke_mcp.py
# macOS + 本地 ModelScope 模型缓存：真实 FunASR -> MCP edit -> export
uv run python scripts/smoke_mcp_asr.py
# 601 秒 / 1202 segments 的长素材 MCP 验证
uv run python scripts/smoke_mcp_long.py
```

架构、协议、阶段验收和后续 Web/TTS 计划见 [CLI/MCP 实施方案](docs/CLI_MCP_IMPLEMENTATION_PLAN.md)。

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
