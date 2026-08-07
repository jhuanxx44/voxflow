# VoxFlow CLI / MCP 规划调研结论

## 2026-08-07 开源发布就绪审计

- M11 远端收尾：最终 SHA `bf2e3bc` 的 VoxFlow V1、Security 与 dependency graph 均成功；可修复告警已自动关闭。仅剩 GHSA-rrmf-rvhw-rf47 的 `requirements.txt`/`uv.lock` 两个 manifest 条目，已按审计文档边界和 2026-09-07 到期日做 `tolerable_risk` 暂缓，当前 open alerts 为 0。
- M12 采用测试专用进程 monkeypatch：`scripts/run_web_e2e_server.py` 在导入 Flask app 前设置临时 `VOXFLOW_HOME`、inline jobs，并替换 worker 模块已绑定的 `FunASRProvider`；正常 Web/CLI/MCP 配置不暴露 fake provider。fixture 在 `.e2e/` 运行时生成，媒体导出仍调用真实 FFmpeg。
- Playwright 以 desktop 1600×900 跑完整视频编辑/五格式下载，以 mobile 390×844 跑音频上传与响应式健康；浏览器 console warning/error、pageerror、Vite overlay 与横向溢出均设为阻塞断言。
- M12 完整本地矩阵通过：desktop 真实视频链路与五格式 export 均成功，MP4/MP3/WAV 经 ffprobe 验证，SRT/VTT 内容验证；mobile 音频链路无横向溢出、console warning/error、pageerror 或 overlay。随后 70 tests、Ruff、mypy、公开内容审计、TypeScript、Vite build 全绿。

- 当前 `dev_edit` 与远端同步且工作树干净，V1 基线 commit 为 `783a226`。
- 法律硬缺口：仓库没有 `LICENSE`；README/pyproject 声明 MIT，而 `package.json` 声明 ISC；package repository 仍指向已迁移的旧地址。
- 安全硬缺口：当前 `.env.example` 和若干 legacy 文档/示例暴露组织内部域名或 key 形态；`.DS_Store` 和一个 157 KB `result/*.json` 被跟踪。重新用 `git log --all -- .env` 与 blob 路径核验后，历史中没有 `.env`，先前哈希来自相邻命令输出，已纠正，不能误报凭据历史泄漏。
- QA 硬缺口：真实浏览器回归证据只在 `/tmp`，项目没有 Playwright 依赖、脚本或 CI job；Vite build 不能代替 UI 回归。
- 传播硬缺口：README 首屏仍把项目描述为泛化编辑器，Agent/MCP 的 preview/apply、revision、持久 artifact 等差异化能力埋在中段。
- 安装硬缺口：README 手工 pip、`start.sh` requirements、Makefile uv extras 三套路径并存；README 端口与 Vite 实际 3001 不一致。
- 架构硬缺口：`voxflow/` 新核心与根目录 legacy routes/services、前端 legacy service/store、静态/示例目录并存，外部贡献者难以判断权威入口。
- M10 采用 MIT：Python PEP 639 `License-Expression: MIT`、npm metadata、README 和根许可证统一；canonical repository 为 `https://github.com/jhuanxx44/voxflow`。第三方 notices 明确 FFmpeg build、依赖和模型权重不被 VoxFlow MIT 重新许可。
- M11 当前树敏感面：内部痕迹文件包括 `.env.example`、`config.py`、旧 LLM/TTS 示例与 `docs/BILIBILI_LLM_API.md`；结果 JSON 不适合作为公开仓库 fixture，应删除并由测试运行时生成匿名 fixture。Flask 开发入口当前绑定 `0.0.0.0:8082`，公开文档必须声明无认证的本地 Web 不应直接暴露公网，默认启动应收紧到 loopback。
- 高置信凭据模式扫描只命中 `.env.example` 的示例字段，没有发现 AWS/GitHub/OpenAI/Google 私钥形态；legacy 文档仍明确记录内部域名和 key 前缀，必须删除或泛化。`config.py` 已从环境读取，没有硬编码值，但注释/默认模型仍带 provider 内部约定。
- `result/yuhua2_advanced_20251225_163423_747.json` 是单条 157,669-byte 识别结果而非测试 fixture；`.DS_Store` 也是已跟踪二进制。两者应从当前树删除，历史彻底抹除不应在无协调情况下 force rewrite。
- GitHub 仓库当前为 public，secret scanning 与 push protection 已开启；Dependabot vulnerability alerts/security updates 关闭。当前 token 有 repo 权限，可在 M11 内启用 alerts、automated fixes 与 private vulnerability reporting，不需要用户交互。
- Flask 当前 `CORS(app)` 全开放且开发入口绑定 `0.0.0.0`。VoxFlow 没有多租户认证边界，公开安全默认应为 `127.0.0.1` + loopback origins；需要局域网访问时由 `VOXFLOW_WEB_HOST`/`VOXFLOW_CORS_ORIGINS` 显式 opt-in。
- M11 dependency audit：npm 原锁定 PostCSS 命中 1 个 high advisory，标准 audit fix 后 production tree 为 0 vulnerabilities；Python base runtime pinned requirements 经 pip-audit 为 no known vulnerabilities。CI 使用 Python 3.11 + `--no-deps --disable-pip`，避免本机 uv Python 3.12 ensurepip 崩溃且仍逐项审计完整 pinned transitive set。
- GitHub repository settings 已成功启用 Dependabot vulnerability alerts、automated security fixes 和 private vulnerability reporting；secret scanning/push protection 原本已开启。内部非 provider pattern/validity checks 当前平台仍显示 disabled，不影响提交侧 Gitleaks 和自有 hygiene gate。
- Push 后 Dependabot 的 19 条提示中，npm 12 条已被锁文件升级自动 fixed；open 为 Flask×2、pytest×1、Torch×4（同一 direct/lock dependency 重复）。Flask 3.1.3 与 pytest 9.0.3 有可用修复。Torch `lstm_cell` 修复在 2.10.0；`torch.jit.script` 修复标为 2.13.0，但当前没有配套 torchaudio 2.13.0，依赖不可解析。
- VoxFlow 自有代码不调用 `torch.jit.script`、`torch.lstm_cell`、`torch.load` 或 pickle；Torch 只由受信任的本地 FunASR/ModelScope provider 加载。先升级可用的 Torch/Torchaudio 2.10 pair；剩余 JIT advisory 若 PyPI 仍无修复组合，可按“仅本地攻击、代码路径不使用、等待 upstream 配套发布”暂缓并设复核条件。
- OSV 全 extras 实测在 Torch 2.10 剩 2 条：`PYSEC-2025-194` 为本地触发 `torch.jit.script` memory corruption（自有/FunASR扫描均无调用）；`PYSEC-2026-139` 为 PT2 loading deserialization、只可本地触发且 upstream PR 尚未发布修复。FunASR/ModelScope 当前代码扫描未发现对应 API，但模型反序列化仍要求只使用受信任模型源与缓存。
- 这两条不能伪装成“零漏洞”：应在 CI 以精确 ID ignore、在安全审计写明 accepted-risk/复核日期/升级条件，并在 GitHub Dependabot 上用 `tolerable_risk` + 证据 comment 暂缓；其余 Flask/pytest/lstm advisory 通过可用版本真实修复。
- ASR adapter 的模型 ID 是代码内固定的官方 `iic/...`，外部用户不能通过 CLI/Web 请求注入任意模型路径；但当前两套 FunASR 初始化都设置 `trust_remote_code=True`，所以本地模型缓存和上游模型源必须视为受信任代码供应链，而非普通媒体输入。Torch deserialization accepted-risk 文档必须明确这点，不能泛称完全无触发面。
- 进一步检查 FunASR 1.2.7 源码：`trust_remote_code` 没有任何读取点，缓存模型目录也无远程 `.py`；该参数只是误导性遗留，应删除。真正供应链风险是 FunASR 的 `model_revision`/VAD/punc/spk revisions 默认 `master`，需要从已验证缓存元数据找到可复现 revision 或至少记录 model source/禁用自动更新边界。
- 本机缓存 `.mv` 显示四个 ModelScope 模型均来自 `master`，`.msc` 为 ModelScope 自有二进制缓存元数据；当前没有可直接复用的仓库 commit pin。M11 先删除无效 `trust_remote_code`、保持 FunASR `disable_update=True`、固定模型 ID，并把模型源/缓存列为信任边界；精确 revision pin 作为后续供应链增强而非伪造未知 tag。
- `7872895` push 后 Dependabot 仍暂显 7 open，其中 Flask/Torch 的一组来自遗留 `requirements.txt`，另一组来自 `uv.lock`；pytest 只来自 uv.lock。Graph Update 正在处理新锁文件。M14 原计划才统一安装路径，但 security 必须先让 legacy requirements 不继续声明已知漏洞版本。
- `bf2e3bc` 已同步 legacy requirements；push banner 降为 4 low。uv dependency graph 成功后 API 仍暂列 requirements 的 Flask 3.1.3/Torch 2.10 两条已修记录，加上两个 JIT accepted-risk。Dependabot pip update jobs 尚在队列；先等待其刷新，不把已明确 patched manifest 误 dismiss 为 tolerable risk。
- M12 API 已支持 `current_app.config["VOXFLOW_RUNTIME"]` 注入 Runtime，适合 E2E 隔离；但前端上传固定调用 `/transcriptions`，不能直接走已有 `/transcripts/import`。需要一个仅由显式 `VOXFLOW_E2E=1` 启动脚本注入的 deterministic ASR worker/provider，不能在正常产品配置中暴露 fake model。
- Web 主链已有大量 `data-testid`（segment/token/media/revision/speaker dialogs 等）和服务端稳定 ID，可直接构建 Playwright page objects；导出 API 是真实 inline job + artifact 下载，因此 CI fixture 只需生成很短的合法 WAV/MP4，五种格式可实际 ffprobe/文本验证。

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

## Phase 8 TTS replacement 设计约束

- 正式规划要求严格两阶段：speech job 只生成候选 artifact；`attach_speech_replacement` 经 preview/apply 后才改变 timeline 和最终导出。
- 音频 project 默认使用 replacement 自然时长并 ripple 后续 clip；视频 project 默认 `fit_source` 保持画面时长，安全 stretch 比率 0.8–1.25，超限必须拒绝或显式 `pad_or_trim` warning，禁止静默截断。
- 候选 artifact metadata 必须绑定 project、expected revision、clip fingerprint、原 clip/source 时长、文本、provider、voice reference、参数/版本与实际 ffprobe duration；attach 时重新核验 catalog metadata，不能信任客户端填写的 duration。
- 现有 legacy `/tts` 同步返回浏览器 Blob，source 依赖旧 material/upload file ID，无法重启恢复且不进入 renderer；Phase 8 主链必须替换，旧路由仅保留兼容。
- 当前 `TimelineClip.duration_ms` 固定取 source range；Phase 8 需增加持久化 replacement/render duration 与 policy，使 audio ripple 的 timeline duration 和视频 fit_source 时长均可确定计算。
- 前端迁移可保留现有组件契约：每次从 server timeline 构造 `lastSegments` view cache，并令 `composition=[0..n)`；稳定 `clip_id`/`token_id` 由新增的 timeline/char 元数据承载，不能继续用数组下标作为写协议。
- 客户端 localStorage ASR cache 应退出权威链路；Headless 已有 source hash + ASR config cache。Web 识别流程改为 create project → detached transcription job → poll → fetch transcript/timeline。
- Undo/Redo 可用 revision target 双栈实现：普通 commit 记录 base revision；undo restore 目标 revision并把 undo 前 revision 放入 redo 栈；redo 再 restore该目标。每次 restore 都生成新的单调递增 revision。
- 多个 UI 动作必须串行提交，否则同步触发的 chat 批量删除/替换会共享旧 expected revision；前端 store 需要 mutation queue，并在每个任务执行时重新读取当前 revision/view cache。
- 字/词级写入必须让 `CharUnit` 携带 `tokenId` 和 `clipId`；无 token precision 的 segment 只能明确拒绝词级删除，不能静默退化成错误范围。
- 前端旧 localStorage ASR cache、legacy export service 目前仍保留为未使用兼容代码，但主 UI 已不再调用；Phase 7 收尾可在引用审计后决定删除或标记 deprecated。
- 浏览器刷新只需恢复 committed project view；undo/redo 双栈是当前浏览器会话 UI 状态，不需要跨刷新持久化。revision history 仍完整保存在后端。
- Web 支持 `/?project=<project_id>` 深链打开 CLI/MCP 创建的项目，并在成功 hydrate 后写入当前项目 localStorage；这是三入口共享 project 的直接用户入口，也便于隔离 E2E。
- Browser 实证确认 restore-based undo/redo 的 revision 单调性：delete 1→2、undo 2→3（restore r1）、redo 3→4（restore r2）；刷新后 r4 保持且被删内容未回归。
- Phase 8 最终采用两阶段候选：speech job 持久化 WAV/artifact metadata，只有带 artifact/fingerprint/duration policy 的 `attach_speech_replacement` Edit Plan 才产生新 revision。
- 浏览器音频实证：artifact URL 候选播放 1.44 秒，attach 后 Revision 1→2，刷新后替换文本与相同 artifact URL 均恢复。
- 浏览器视频实证：4.32 秒 replacement 对 1 秒 clip 的 fit ratio 为 0.231，UI 显示 warning 且禁用 apply；显式 pad_or_trim 后可提交，导出 MP4 音频 2.50 秒、视频 2.52 秒。
- React 主 TTS hook 已完全退出 legacy `/tts` Blob 路径；legacy endpoint 仅保留一周期并返回 deprecation/successor headers。

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
# Phase 9 发布加固（2026-08-07）

- Linux 本地实证最终使用已校验的 Alpine 3.23.4 aarch64 cloud image + Lima/VZ；SHA-512 与 USTC 发布 sidecar 完全一致。VM 内为 Linux 6.18.22、Python 3.12.13、FFmpeg/ffprobe 8.0.1。
- 当前 Phase 9 工作树在 VM 内独立复制最小构建输入并生成 `voxflow-1.0.0-py3-none-any.whl`，随后安装到全新 venv；不是复用 macOS venv 或 editable install。
- 仓库外 smoke 成功输出 `{ok: true, project_id: prj_c4ccc1ab66554bfdb198fbc4c502f71c, output_bytes: 10057}`。脚本自身已用 ffprobe 断言导出 MP4 同时有 audio/video stream，且时长 1.0 秒 ± 0.15 秒；TemporaryDirectory 正常退出后自动删除产物，因此无需伪造额外持久产物证据。

- 既有 `scripts/smoke_mcp_long.py` 只覆盖 601 秒正弦波 + 1202 个合成 transcript，不足以证明正式 Phase 9 的 30–120 分钟 ASR + 10+ edits + export 验收。
- 仓库当前没有可复用的音频/视频媒体文件；`Settings` 的默认 `examples/xiaolin.wav` 也不在仓库中。
- 因此正式长文件验收需要使用可追溯的公开授权真实语音素材，下载到隔离临时目录，不进入 Git；报告必须记录来源、license、SHA-256、时长和完整命令。
- Phase 9 基础功能已通过全仓 `make check`：67 tests、Ruff、mypy 全绿。
- Internet Archive metadata 请求在 20 秒内超时，未下载或写入任何仓库文件；改用 FunASR 官方公开测试音频源。
- FunASR 官方 `vad_example.wav` 下载成功：70.470625 秒、2,261,722 bytes、SHA-256 `a7431f0169ef76ef630c945a1d2c3675d8c8c2df2ae4a6b16f8a88ba1bccfbbb`。这是自然中文语音，可重复拼接为 30+ 分钟压力输入；报告会明确说明“真实语音样本重复拼接”，不将其表述为 30 分钟独立录音。
- 长素材脚本使用 10 个独立 `delete_clips` operation + 1 个 `move_clip` + 1 个 `correct_transcript`，preview/apply diff 必须完全一致；导出 duration 与 edit diff 的容差为 250ms。
- 首次 30 分钟导出基线把 683 个非相邻 source ranges 编译为 683 个并行 `atrim`；FFmpeg 持续约 106% CPU，但 5 分钟仍未产出，说明旧 graph 对长 transcript 是真实的 O(ranges × source duration) 性能瓶颈。
- 优化方案：对 16+ 且互不重叠的 audio-only ranges 使用一次 `asegment` 按全部边界精确拆分，再按 timeline 顺序 concat 选中片段；既支持任意重排，又只解码源一次。重叠范围保守回退旧 graph。
- 同一 30 分钟 project/revision 优化对比：旧 graph 582.744 秒；新 graph `real 3.81s`。两者输出均为 30,379,042 bytes，SHA-256 均为 `d24a0bf0d633686cf8249c3c2f46b3865460f780c6f393277d42bd1a411f04d5`，ffprobe duration 均为 1518.807 秒，因此加速未改变成片。
- macOS fresh install 已有本地实证。Docker Desktop backend HTTP 500 后改用已校验 Alpine 3.23.4/Lima VM，Linux fresh wheel install 与 E2E 已实际通过；Ubuntu CI matrix 保留为 push 后的第二 Linux 发行版证据。
