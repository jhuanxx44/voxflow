# VoxFlow CLI / MCP 规划调研结论

## 2026-08-07 完整本地 V1 续作

- 新目标明确扩大到正式规划 Phase 7–9，并要求完成 Web 核心链路浏览器回归。
- 原 `task_plan.md` 中的“Phase 7”只是 Phase 0–6 的完成审计，不是正式规划的 Web UI 迁移；已纠正命名和后续范围。
- 当前 HEAD 仍为 `45ce38d`，Phase 0–6 全部实现位于未提交工作树；在开始 Phase 7 前应重新验证并作为独立大模块提交。
- Web 回归不能以 `npm run build` 或 Flask smoke 代替；必须覆盖真实渲染、交互、console 和截图证据。
- 当前 Web 仍完全调用 legacy `/asr`、`/export-media`；`package.json` 尚无 E2E 脚本或 Playwright 依赖。
- `editorStore.ts` 仍以 segment/char 数组下标作为权威 composition，并在浏览器内维护 speaker 状态与 undo/redo；这正是 Phase 7 要迁移的边界。
- UI 已存在段落/字符删除、拖拽、speaker rename/merge、undo/redo、编辑播放与导出交互，可优先保留组件外观，把状态动作替换为 project/revision application API。
- Headless application 层已经具备 project create/get/list、transcript page/search/timeline、edit preview/apply/history/undo、export start/artifact lookup；Phase 7 后端主要是 Flask adapter、上传暂存和安全媒体下载，不应复制领域逻辑。
- 当前 `ProjectService.create` 仅接受本地 `Path`；Web multipart adapter 可保存到受控临时目录后调用 managed ingest，完成后删除暂存文件。
- Timeline 已持久化 `speaker_labels`/`speaker_merges`，Edit Plan 已支持 delete clip/token range、move、correct transcript、rename/merge speaker，能够覆盖目标 UI 动作。
- 当前后端 undo 是“恢复目标 revision 并生成新 revision”；尚无 redo 专用 API。Web redo 可恢复 undo 前的 revision，同样生成新 revision，但 UI 需维护 redo target view state。
- JobService 已支持 detached transcribe/export、状态查询、取消、重试；Web API 应返回 202 job 并由前端轮询，避免重建同步长请求。
- Vite dev proxy 当前未包含 `/api/v1`，Phase 7 需要新增代理；Flask `app.py` 直接注册 Blueprints，无 app factory，可通过 lazy runtime + app config 测试注入保持 import 轻量。
- Web artifact 下载需要经过受控 Flask `send_file` endpoint，浏览器不应接收/拼接本地绝对路径；source preview 同样应按 project ID 服务 managed media。
- 正式 Phase 7 可拆成两个可独立验收的大模块提交：版本化 Flask adapter/contract tests；React/Zustand project/revision 迁移与浏览器证据。
- Web API 视图必须净化 project `managed_path`、job `log_path`/result path、artifact path；浏览器统一使用受控 source/download URL，CLI/MCP 仍保留本地路径能力。

## 当前可复用能力

- Flask 后端已有 ASR、TTS、媒体导出、素材管理和聊天路由。
- ASR 支持音视频上传、视频抽取音轨、基础/高级识别、热词和说话人信息。
- 上传媒体会生成临时 `file_id`，现有导出路由可据此访问源文件。
- FFmpeg 已支持按毫秒时间段 trim、concat，并导出 MP4/MP3/WAV。
- 前端已有删除、批量删除、重排、文本替换、说话人合并、undo/redo 和 TTS 试听交互。

## 核心缺口

- 编辑工程只存在于浏览器 Zustand 状态，没有后端 Project/Timeline 模型。
- composition 使用数组下标引用原始 segment；不适合作为跨进程、跨轮次工具协议。
- `deleteByText` 会匹配所有相同文本，模型操作存在歧义和误删风险。
- TTS replacement 只保存为浏览器 Blob URL；当前导出只拼接源媒体时间段，TTS 不进入成片。
- 上传与导出任务存于 Python 进程内存；重启、多 worker 和任务恢复均不可靠。
- 导出是同步 Flask 请求，最长等待 10 分钟，不适合 agent 的可恢复任务工作流。
- 内置 LLM 客户端绑定 Gemini；若外部 Codex 通过 MCP 调用，不应让编辑内核依赖该客户端。
- 没有正式的单元/集成/E2E 测试体系。

## 规划原则

- 外部模型生成结构化 edit plan，VoxFlow 只验证、模拟、提交和渲染。
- 所有媒体和编辑对象有稳定 UUID；所有项目写入使用乐观 revision 检查。
- CLI 是可脚本化的完整接口；MCP 是 application service 的薄适配层。
- 人类可读输出与稳定 JSON 并存；stdout JSON、stderr 进度。
- 先完成无 TTS 的确定性粗剪闭环，再加入 replacement clip 混编。

## 最终推荐

- Python 3.11 + uv，拆分 base/mcp/web/asr-local/dev 依赖，所有重型 provider 惰性加载。
- 使用 Project/Transcript/Timeline/Revision/Artifact 五类稳定领域对象。
- project manifest 和 revision 以原子 JSON 持久化；SQLite 管理 catalog、job 和幂等键。
- CLI 和 MCP 都直接调用 application service；MCP 使用 start/status 处理长任务。
- MVP 为 Phase 0–6，19–31 人日；完整本地 V1 为 31–52 人日。
- 源媒体 ingest 使用 CoW clone/reflink 优先、copy fallback，禁止用 hardlink 破坏项目隔离。
- 词级删除通过稳定 token IDs 编译为 split + delete；无 token 时间戳时明确降级为 segment precision。
- TTS 使用“先生成候选 artifact、再通过 edit plan 挂载”的两阶段提交。

## 实施环境

- 当前分支为 `dev_edit`，HEAD `45ce38d`。
- 系统同时有 Python 3.14 和 3.11；项目现有 `.venv` 是 Python 3.11，必须显式锁定 `<3.13`。
- `uv`、FFmpeg 和 ffprobe 已安装；可直接建立可安装 Python CLI。
- 当前没有 Python package、pyproject 或自动化测试；Phase 0 从零建立。
- 规划文件当前未跟踪，实施时一并保留，不覆盖用户已有业务改动。

## Phase 0–6 完成审计基准（2026-08-05）

- Phase 0 必须同时证明：无模型 key 的 core tests、`npm run build`、现有 Web 基本流程无回归；不能仅凭 Python 测试判定完成。
- Phase 1 必须证明：重启读取、同源独立项目，以及路径越界/损坏 manifest/并发写入的明确错误。
- Phase 2 必须证明：持久化 ASR job、带稳定 ID 与上下文的搜索、重启后 completed job/transcript 保留；规划任务还要求 source hash + ASR config 缓存键。
- Phase 3 必须证明：preview/apply diff 一致、operation 失败零 revision、并发 revision conflict；规划任务还明确要求 timeline invariants 和 property-based tests。
- Phase 4 必须证明：preview 预计时长与产物时长容差、ffprobe codec/流/时长，以及空 timeline、无音轨视频、极短/相邻/大量 clips 边界。
- Phase 5 必须证明：安装态命令、从 fixture 到 edited MP4 的 shell 流程，以及 JSON contract golden tests。
- Phase 6 必须证明：官方 MCP 客户端列出 tools/resources、无 Web UI 的导入→读取→dry-run→apply→export，以及长 transcript 输出有界。

## 初轮证据缺口（2026-08-05）

- 当前测试已覆盖重启读取、catalog rebuild、主要编辑操作、幂等/undo、MP3/SRT/MP4、detached export worker、fake ASR worker、CLI envelope 和 MCP discovery。
- 规划明确要求的 ASR `source hash + ASR config` 缓存尚未实现；worker 每次都会调用 provider。
- 规划明确要求的 property-based timeline invariant tests 尚未存在，`dev` extra 也尚未声明 Hypothesis。
- Phase 1 尚缺同源独立项目、路径越界、损坏 manifest、锁冲突的直接测试证据。
- Phase 3 尚缺 operation 中途失败零 revision、两个客户端 revision conflict 的直接测试；preview/apply 当前只间接比较了预计时长。
- Phase 4 尚缺产物时长容差、空 timeline、无音轨视频、极短/相邻/大量 clips 的系统边界测试；现有 MP4 测试仅断言音视频流类型。
- Phase 5 的 CLI smoke 当前导出 MP3，不满足规划中明确的 edited MP4 shell 验收；JSON contract 只有字段断言，尚无规范化 golden fixture。
- 当前媒体 fixtures 为 2 秒，不满足 Phase 0 任务中 5–15 秒 fixture 的明确要求。

## 完成审计结论（2026-08-05）

- 上述初轮缺口均已通过实现或直接证据关闭：ASR cache、Hypothesis invariants、Phase 1 错误边界、原子/冲突、renderer 全边界、edited MP4 smoke、typed MCP schema 和 5 秒 fixtures 已落地。
- 额外发现并修复了 reducer 随机派生 ID、video-only 输入、running cancel 被记为 failed、旧 Web providers 缺失、basic FunASR 顶层 timestamp、catalog stale rows 和 MCP 任意 object schema 等问题。
- 真实 FunASR CLI 与官方 MCP E2E 均识别出完整中文句子；MCP E2E 继续完成 preview/apply、revision 2 和 WAV artifact。
- 601 秒/1202 segments 的 Codex MCP 粗剪满足 MVP Definition of Done 的 10 分钟以上素材要求，输出 596.0 秒与 preview 一致。
- 最终 `make check`：50 tests、ruff、mypy 全绿；schema check、前端 build、安装态 CLI/MCP smoke 和 companion skill validation 均通过。
- Phase 7–9（Web project/revision 迁移、TTS replacement 成片、发布加固）明确不在本次用户要求的 Phase 0–6 范围内，未被误标完成。
