# VoxFlow CLI / MCP 规划进度

## 2026-08-07 完整本地 V1 Phase 7–9

- 用户要求继续实现正式规划 Phase 7–9，完成 Web 核心链路回归，每个大模块完成后 commit，全部验收通过后 push。
- 已运行 planning session catchup，并核对 HEAD、工作树、正式规划与现有 Phase 0–6 验收证据。
- 已纠正任务计划中的阶段命名，将正式 Phase 7 Web 迁移、Phase 8 TTS replacement、Phase 9 发布加固及 Web 浏览器回归纳入持续目标。
- 下一步：重新执行 Phase 0–6 当前工作树质量门，形成独立基线 commit；随后审计现有 Web 架构并实施 Phase 7。
- Phase 0–6 提交前质量门通过：`make check`（50 tests、ruff、mypy）、`npm run build`（242 modules）、`uv lock --check`、`git diff --check`。
- 正在创建 Phase 0–6 独立基线 commit。

## 2026-08-04

- 完成仓库结构、README、后端路由、FFmpeg 导出、ASR、LLM、编辑 store、TTS 和前端导出链路审计。
- 确认改造核心是 headless editing core，而非简单包装 HTTP API。
- 确认 CLI 和 MCP 应共享 Python application 层，外部模型负责意图理解。
- 已创建规划工作文件。
- 正在设计正式实施方案的数据模型、工具契约、阶段排期与验收标准。
- 已完成 Project/Timeline/Edit Plan、revision、job、artifact 和 TTS duration policy 设计。
- 已完成 CLI 命令、JSON envelope、MCP tools/resources 与 Agent 工作流设计。
- 已完成 Phase 0–9 的任务、依赖、工期和逐阶段验收标准。
- 已完成测试、安全、发布、迁移、性能和 Definition of Done 规划。
- 正式方案已写入 `docs/CLI_MCP_IMPLEMENTATION_PLAN.md`。
- 最终审查修正了源媒体 hardlink 隔离风险，改为 CoW clone/copy。
- 补充稳定 token ID、词级删除降级规则，以及 TTS candidate artifact 两阶段提交。
- `git diff --check` 通过；规划阶段全部完成。

## 2026-08-04 Phase 0–6 实施

- 用户已授权按照正式规划实现 Headless 内核和 CLI/MCP MVP。
- 已恢复规划上下文并核对工作树；当前只有规划相关未跟踪文件，没有既有业务改动需要避让。
- 已确认 `/opt/homebrew/bin/python3.11`、`uv 0.9.15`、FFmpeg/ffprobe 8.1.1 可用。
- 已选择 Python 3.11 作为 CLI/MCP 运行时，以直接复用现有 FunASR/TTS/FFmpeg 代码。
- Phase 0 工程基线开始实施。
- 已新增 `pyproject.toml`、Makefile 和 `voxflow` Python package 骨架。
- 已实现版本化 Project/Transcript/Timeline/Artifact/Job models、稳定 typed IDs 和结构化错误。
- 已实现 Edit Plan v1 的操作 schema 与无 I/O 纯 reducer，包括 clip/词级删除、移动、裁剪、拆分、文本和说话人操作。
- 已实现原子 JSON、SHA-256、CoW/copy managed ingest、ffprobe 媒体检查。
- 已实现 SQLite catalog（project/artifact/job/idempotency）和带进程锁的 ProjectStore。
- ProjectStore 已支持创建、读取、分页列出、transcript 初始化、revision commit/history 和持久化 artifact。
- `uv.lock` 已生成；首次仅同步 dev/mcp extras 会移除旧 `.venv` 中未声明的 Web/ASR 包，已识别并调整 Makefile 为开发环境同步全部现有运行时 extras。
- 已实现惰性 FunASR provider、视频音轨提取和 FunASR 结果规范化；无可靠 token 时间戳时明确降级为 segment precision。
- 已实现 Project、Transcript（分页/搜索/上下文/timeline）和 Edit application services。
- 编辑提交现在具备 project lock、expected revision、幂等冲突、原子 revision、history 与非破坏性 undo。
- 已实现 SQLite 原子 job claim、持久化状态、独立子进程提交、轮询、取消和 worker 失败边界。
- transcribe job 已贯通 source hash 校验、惰性模型加载、规范化、transcript/timeline 原子保存。
- 已实现 timeline -> normalized render ranges、FFmpeg 参数构建、可取消导出和 SRT/VTT 连续时间码。
- MP4/MP3/WAV/SRT/VTT 均通过持久化 export job 生成 managed artifact，并可复制到显式 `--out`。
- 已添加 model、ASR normalization、ProjectStore、edit/idempotency 和真实 FFmpeg export 的首批测试。
- 已实现完整 CLI 命令树、轻量 doctor、稳定 success/error envelope、分页、dry-run、job wait、artifact 与 raw read escape hatch。
- CLI contract tests 覆盖 help 能力发现、无模型 doctor 和结构化错误。
- 已实现 stdio MCP server，提供 16 个有界高层 tools 与 project/job resources；媒体只返回 artifact 路径，不进入上下文。
- MCP 与 CLI 共享 success/error envelope 和同一 Runtime/application services。
- 第一轮 ruff 暴露 import 排序、长行和未使用变量；已机械格式化并修复 FFmpeg 临时文件必须保留真实扩展名的问题。
- 第一轮 mypy 暴露 6 个类型问题，已针对 Literal、可选 FunASR stub 和 ProjectStore.list 名称遮蔽逐项修复。
- 第一轮质量门通过：ruff/format/mypy 全绿，12 tests passed，包含真实 FFmpeg export。
- 已补持久化 artifact manifests/catalog rebuild、stale job -> interrupted、job retry、render heartbeat 与 source hash 二次校验。
- Edit revision 现在记录 request ID、operation digest 和 apply result，可恢复“revision 已落盘但幂等索引尚未写入”的崩溃窗口。
- 已扩充编辑组合操作、undo、catalog rebuild、stale job 和真实 MP4 音视频流测试；幂等 replay 现在显式返回 `idempotent_replay=true`。
- 已增加七类版本化 JSON Schema 生成器和安装后跨目录 CLI 端到端 smoke 脚本。
- Phase 0 质量门再次通过：ruff/mypy + 16 tests；已安装 `~/.local/bin/voxflow`。
- 已从 `/tmp` 完成真实安装态 CLI smoke：doctor、project、transcript、timeline、edit preview/apply、export 全链路成功，MP3 产物 22365 bytes。
- MCP 新增安全的本地 transcript JSON import 工具，用于离线迁移和不加载模型的完整协议测试。
- 已添加官方 MCP ClientSession + stdio transport 的真实端到端 smoke 脚本。
- 官方 MCP stdio smoke 已通过：19 tools，project/transcript/timeline/edit/export/job/artifact/resource 全链路成功。
- 已安装并通过 quick_validate 验证个人 `$voxflow` companion skill；它要求稳定 ID、preview-first 和显式写入。
- 旧 Flask `services/asr_service.py` 已改为 LazyAutoModel，import 后端不再立即加载 FunASR/Torch。
- README 已补安装、Agent 工作流、Edit Plan、MCP 配置和验证命令。
- Worker 增加独立 heartbeat 线程，避免长 ASR 被其他 CLI/MCP 进程误判为 stale；FFmpeg 轮询不再高频写 SQLite。
- 已增加 fake-provider transcription 持久化测试、独立子进程 export job 测试和 committed JSON Schema 一致性测试。

## 2026-08-05 Phase 0–6 验收收尾

- 已通过 `planning-with-files` session catchup 恢复上一轮上下文，并以当前工作树为准开始完成审计。
- 当前待验证项：最新 heartbeat/worker/schema 测试改动、安装态 CLI/MCP smoke、ASR/Web 依赖恢复、前端构建及 Phase 0–6 逐项验收证据。
- 当前工作树仍位于 `dev_edit` / 原始基线 `45ce38d`，实现文件尚未提交；未执行提交或推送。
- 初轮验收审计发现并开始补齐实际缺口：ASR source-hash+config cache、property-based invariant tests、Phase 1 错误/隔离/锁证据、renderer 边界、CLI JSON golden 与 edited MP4 smoke。
- 修复纯 reducer 的非确定性：split/delete-range 派生 clip ID 改为由 project/request/operation 确定性生成，preview/apply 现在可产生完全相同 diff。
- 新增内容寻址 ASR raw-payload cache；相同源 hash + provider/model/hotwords 跨项目复用，命中时不加载 FunASR，损坏 cache 自动丢弃重算。
- 新增 timeline invariant validator 和 Hypothesis property tests，覆盖 split/trim/token deletion 的确定性、正时长与 duration 守恒。
- 补同源项目隔离、路径越界/损坏 manifest、进程锁冲突、operation 原子失败、stale revision conflict、completed ASR restart 等直接测试。
- renderer 新增视频-only MP4 支持；无音轨素材允许导入，但 ASR/MP3/WAV 提前返回明确错误。补 codec/流/时长、空 timeline、1ms clip、相邻和 1000 clips 测试。
- 新增可选 `VOXFLOW_ALLOWED_INPUT_ROOTS` realpath/symlink 边界校验、transcript/source 时长上界和 speaker 引用校验。
- doctor 新增 codec、磁盘空间和已安装 schema 检查，仍不加载 FunASR/Torch。
- CLI contract 新增成功/错误 golden files；安装态 smoke 改为生成、编辑并 ffprobe 验证 MP4；MCP smoke 改用 500 segments 验证分页/搜索上下文，并检查 resource templates。
- MCP 增加 timeline summary resource、`next_cursor` 与关键写流程的 `recommended_next_tool` 元数据。
- 已直接运行 ruff format/check 和 mypy：全绿；完整 pytest 等待 ASR 全量依赖同步与新增 Hypothesis 锁定后执行。
- 完整 ASR/Web/provider extras 已恢复：FunASR 1.2.7、Torch 2.9.1、OpenAI 2.14.0、google-genai 2.16.0 均进入锁文件和 `.venv`。
- 全量 Python gate 首轮结果：44 tests passed、schema check 通过；mypy 的 optional import 注解问题已修复并重跑通过。
- 安装态 CLI `/tmp` smoke 已通过：真实 MP4 导入、preview/apply、edited MP4 导出，ffprobe 验证音视频流和 1 秒时长。
- 官方 stdio MCP smoke 已通过：19 tools、500 segments 分页/搜索、typed Edit Plan、编辑/导出/artifact 和 3 个 resource templates。
- 601 秒 MCP 长素材任务已通过：1202 segments，删除 10 clips + 重排，preview/apply diff 一致，输出时长经 ffprobe 为 596.0 秒。
- `npm run build` 通过（242 modules）；旧 Flask root/health/server-status/export validation smoke 通过且未加载 FunASR/Torch。
- 注意：旧 Flask `/export-media` 的既有 `cleanup_old_exports()` 在 validation 前执行，本次 smoke 清除了 3 个超过 TTL 的旧临时 export 文件；这是现有清理策略，不是 Headless store/artifact 删除。
- 安装目标已调整：`make install-local` 现在安装 MCP + FunASR，`install-local-lite` 保留无 Torch 的轻量选择；安装态 doctor 确认 FunASR installed 但未加载。
- 真实 CLI advanced FunASR job 在 69.3 秒完成，输出 3 个 token-precision segments，识别文本与输入中文完全一致。
- 官方 MCP 真实识别 E2E 已通过：project_create → transcript_start/detached polling → transcript/timeline → edit preview/apply → WAV export/job → artifact。
- 结构性能实测（1000 clips）：project get max 5.02ms、transcript page max 3.97ms、timeline page max 4.15ms、edit preview max 12.75ms；均低于规划目标。
- 3 个 detached export（MP3/WAV/SRT）并发成功，artifact IDs 独立。
- 最终 `make check` 通过：50 tests passed、ruff format/check 与 mypy 全绿；`npm run build`、schema check、CLI/MCP smoke 全绿。
- `docs/HEADLESS_MVP_TEST_REPORT.md` 已逐项记录 Phase 0–6 和 MVP Definition of Done 证据；`git diff --check` 通过，无残留 worker/sync 进程。
