# VoxFlow Headless CLI/MCP MVP 验收报告

> 验收日期：2026-08-05  
> 验收范围：`CLI_MCP_IMPLEMENTATION_PLAN.md` Phase 0–6  
> 环境：macOS / Python 3.11.15 / uv 0.9.15 / FFmpeg 8.1.1 / FunASR 1.2.7 / Torch 2.9.1

## 结论

Phase 0–6 的 Headless 编辑内核、CLI 和 stdio MCP 已实现并通过验收。Codex 可在不调用 Web UI 的情况下完成本地媒体导入、真实 FunASR 识别、分页读取/搜索、确定性 preview/apply、revision/undo 和 MP4/MP3/WAV/SRT/VTT 导出。

本报告不宣称 Phase 7–9 完成：Web UI 迁移、TTS replacement 进入成片和发布加固仍属于后续规划。

## 质量门

| 检查 | 命令 | 结果 |
|---|---|---|
| Format | `.venv/bin/ruff format --check voxflow tests scripts` | 通过 |
| Lint | `.venv/bin/ruff check voxflow tests scripts` | 通过 |
| Typecheck | `.venv/bin/mypy voxflow` | 通过，30 source files |
| Tests | `uv run pytest -q` | 通过，50 tests |
| Committed schemas | `.venv/bin/python scripts/generate_schemas.py --check` | 通过 |
| Frontend | `npm run build` | 通过，242 modules |
| Companion skill | `quick_validate.py ~/.codex/skills/voxflow` | `Skill is valid!` |

测试包含 unit、property、contract、legacy compatibility、integration 和独立 worker 场景；不依赖 API key 或网络模型下载。

## Phase 0–6 逐项验收

### Phase 0：行为固化和工程基线

| 验收项 | 证据 | 结果 |
|---|---|---|
| Python 3.11 package、uv lock、pytest/ruff/mypy | `pyproject.toml`、`uv.lock`、上述质量门 | 通过 |
| 5–15 秒媒体 fixtures | 5 秒 WAV、含音轨 MP4、无音轨 MP4 fixtures | 通过 |
| ASR/FFmpeg/SRT/VTT/编辑 characterization | ASR payload、legacy FFmpeg filter、renderer/subtitle、operation tests | 通过 |
| 无 key 可运行 core tests | `uv run pytest -q`，未配置 provider key | 通过 |
| CLI/doctor/Web import 不加载 FunASR/Torch | 独立进程断言 `funasr`、`torch` 不在 `sys.modules` | 通过 |
| Frontend build 和旧 Web 基本流程 | `npm run build`；Flask root/health/server-status contract | 通过 |

### Phase 1：Domain schema 与 Project Store

| 验收项 | 证据 | 结果 |
|---|---|---|
| Versioned schemas 与稳定 typed IDs | 7 个 committed JSON Schema；`prj_/seg_/tok_/clip_/art_/job_` UUID | 通过 |
| Atomic manifest/revision | temp file、file fsync、atomic rename、directory fsync | 通过 |
| Managed ingest | ffprobe、SHA-256、macOS CoW clone/copy fallback；无 hardlink | 通过 |
| 重启读取 | 新 Runtime/ProjectStore 读取 project、timeline、transcript | 通过 |
| 同源独立项目 | 不同 managed path；修改一份不改变另一份 | 通过 |
| 路径/损坏/并发错误 | project ID traversal、allowed-root/symlink escape、损坏 manifest、lock conflict tests | 通过 |
| Catalog rebuild | project/artifact manifests 重建，并清除 stale discovery rows | 通过 |

### Phase 2：ASR Application Service

| 验收项 | 证据 | 结果 |
|---|---|---|
| Provider boundary 与惰性 FunASR | `ASRProvider` + `FunASRProvider`；首次 recognition 才 import runtime | 通过 |
| Normalization | advanced `sentence_info`、basic 顶层 timestamp、token 缺失降级 segment precision | 通过 |
| 内容寻址缓存 | source SHA-256 + provider/schema/model/hotwords；跨项目 cache hit 不加载 provider | 通过 |
| 分页/搜索/上下文 | 最大 200/page；search 返回 segment、clip IDs 和 before/after | 通过 |
| Persistent job/worker | SQLite job、detached process、atomic claim、heartbeat、cancel/retry/interrupted | 通过 |
| 重启保持 completed job/transcript | fake provider execute-job + 新 Runtime 读取 | 通过 |
| 真实本地识别 | macOS `say` 中文语音 → advanced FunASR，3 token-precision segments，文本完全匹配 | 通过 |

真实识别结果：`你好，欢迎使用语音编辑工具。今天我们测试真实语音识别。`

### Phase 3：确定性编辑内核

| 验收项 | 证据 | 结果 |
|---|---|---|
| Edit Plan schema/validator/reducer | Discriminated union；Domain 不依赖 CLI/MCP/Web | 通过 |
| V1 operations | delete clips/ranges、move、trim、split、correct text、rename/merge speaker | 通过 |
| Reducer 确定性 | 派生 clip ID 使用 deterministic UUID5；property tests 重复结果一致 | 通过 |
| Preview/apply 同 diff | unit/integration/CLI/MCP/601 秒场景均做完整 diff equality | 通过 |
| 原子失败 | 多 operation 中后项失败时 revision 文件和 timeline 均不变化 | 通过 |
| Revision conflict | 两个客户端基于 revision 1，后提交者得到 `REVISION_CONFLICT` | 通过 |
| 幂等与 crash window | 同 key/同 payload replay；不同 payload conflict；revision 已提交后可恢复索引 | 通过 |
| History/undo | 旧 revision 内容以新 revision 恢复，不改写历史 | 通过 |

### Phase 4：Renderer v1

| 验收项 | 证据 | 结果 |
|---|---|---|
| Timeline → render plan → FFmpeg args | compiler 与 command builder 分离；始终使用 argv，不使用 shell | 通过 |
| 格式 | MP4、MP3、WAV、SRT、VTT persistent artifacts | 通过 |
| Codec/stream/duration | ffprobe 验证 H.264/AAC、音视频流和 preview 时长容差 | 通过 |
| 删除/裁剪/重排 | 安装态 MP4、601 秒 MCP 重排、word-range WAV export | 通过 |
| 连续字幕时间码 | 编辑顺序的 SRT/VTT characterization tests | 通过 |
| 边界 | 空 timeline、video-only MP4、1ms clip、相邻 ranges、1000 clips | 通过 |
| Job 行为 | detached worker、3 concurrent exports、cancel/timeout/partial cleanup、source hash recheck | 通过 |

### Phase 5：CLI

| 验收项 | 证据 | 结果 |
|---|---|---|
| 可安装命令 | `command -v voxflow` → `~/.local/bin/voxflow` | 通过 |
| 完整命令面 | doctor/project/transcript/timeline/edit/job/export/artifact/raw/mcp | 通过 |
| Stable JSON | success/error golden files；stdout JSON、wait progress stderr、稳定退出码 | 通过 |
| 冷启动 | installed `--help` 0.824s；doctor 0.151s；均不加载 FunASR | 通过 |
| `/tmp` installed smoke | 视频导入 → transcript → preview/apply → edited MP4 → ffprobe | 通过 |
| Recognition 可用安装 | `make install-local` 安装 `[mcp,asr-local]`；doctor 检测 FunASR installed/not loaded | 通过 |

安装态 smoke 输出：`{"ok": true, "output_bytes": 10056}`。

### Phase 6：MCP Server

| 验收项 | 证据 | 结果 |
|---|---|---|
| 官方 stdio SDK | FastMCP server + official `ClientSession`/stdio client | 通过 |
| Tools/resources discovery | 19 tools、projects resource、3 resource templates | 通过 |
| 有界 schema | Pydantic EditPlan discriminator；limit/context/revision/format 枚举写入 tool schema | 通过 |
| Structured result/error | typed success/error union envelope；retryable 语义；recommended next tool | 通过 |
| 长 transcript | 500 segments smoke 默认仅返回 50；1202 segments 使用 cursor 分页 | 通过 |
| 不返回媒体 | tool structuredContent 只含 metadata/path/artifact ID，无 media bytes/base64 | 通过 |
| 无 Web UI 的完整工作流 | project_create → real transcript_start/job polling → read → preview/apply → export/job → artifact | 通过 |
| Companion skill | `~/.codex/skills/voxflow` 验证通过；强制 stable IDs、preview-first、revision | 通过 |

真实 MCP ASR E2E 输出摘要：recognition `succeeded`、3 segments、edit revision 2、export `succeeded`。

## 长素材与性能证据

### 601 秒 MCP 粗剪

- 输入：601 秒 MP3、1202 transcript segments。
- 操作：分页读取、删除 10 clips、将末段移到开头、preview/apply。
- 输出：596.0 秒 MP3，ffprobe 与 preview 完全一致。
- 结果：`source_duration_seconds=601`、`segment_count=1202`、`output_duration_seconds=596.0`。

### 1000 clips 结构性能

| 操作 | Median | Max | 规划目标 |
|---|---:|---:|---:|
| project get | 2.02ms | 5.02ms | <200ms |
| transcript page 50/1000 | 1.68ms | 3.97ms | <200ms |
| timeline page 50/1000 | 1.97ms | 4.15ms | <200ms |
| edit preview / 1000 clips | 9.55ms | 12.75ms | <500ms |

另验证 3 个 detached exports（MP3/WAV/SRT）并发完成，artifact IDs 独立。

## MVP Definition of Done 审计

| 条件 | 结果 |
|---|---|
| Phase 0–6 验收全部完成 | 通过 |
| 全新临时目录安装态导出 smoke | 通过 |
| Codex/MCP 处理 10 分钟以上素材 | 601 秒场景通过 |
| edit dry-run/revision/idempotency/atomicity tests | 通过 |
| ASR/export restart 行为明确并测试 | 通过 |
| 无模糊文本直接删除写工具 | 通过 |
| 无媒体进入 MCP structuredContent | 通过 |
| realpath/allowed-root 校验覆盖本地输入 | 通过 |
| README、CLI help、MCP 配置、Edit Plan 示例 | 通过 |

## 可复现命令

```bash
make sync
make check
npm run build
make install-local

cd /tmp
REPO_ROOT=/path/to/voxflow
python3.11 "$REPO_ROOT/scripts/smoke_cli.py"

cd "$REPO_ROOT"
.venv/bin/python scripts/smoke_mcp.py
.venv/bin/python scripts/smoke_mcp_asr.py
.venv/bin/python scripts/smoke_mcp_long.py
```
