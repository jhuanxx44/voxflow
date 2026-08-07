# VoxFlow 完整本地 V1 + Web 回归实施任务

## 目标

按照 `docs/CLI_MCP_IMPLEMENTATION_PLAN.md` 完成 Phase 0–9：在已完成的 Headless/CLI/MCP 基础上，实现 Web project/revision 迁移、TTS replacement 成片与发布加固，并完成原 Web 核心链路的真实浏览器回归。每完成一个大模块提交一次；全部验收通过后再 push。

## 当前阶段

Web 核心链路浏览器回归

## 阶段

### Phase 0: 工程与测试基线

- [x] 建立 Python 3.11 package、`pyproject.toml`、`uv.lock`
- [x] 建立 pytest/ruff/typecheck 基线和媒体 fixtures
- [x] 保证 CLI/doctor 不加载 FunASR/Torch
- **Status:** complete

### Phase 1: Project Store 与媒体导入

- [x] 实现 Project/Transcript/Timeline/Revision/Artifact schema
- [x] 实现 managed ingest、ffprobe、hash、atomic manifest 和 project lock
- [x] 实现 SQLite catalog/artifact/idempotency
- **Status:** complete

### Phase 2: ASR、Transcript 与持久化 Job

- [x] 实现 provider interface 和惰性 FunASR adapter
- [x] 实现 transcript normalization、分页、搜索和上下文
- [x] 实现持久化 job、独立 worker、状态与重试/取消基础
- **Status:** complete

### Phase 3: 确定性编辑内核

- [x] 实现 Edit Plan schema 和纯 reducer
- [x] 实现 delete/move/trim/split/token range/text/speaker 操作
- [x] 实现 preview/apply/revision/idempotency/history/undo
- **Status:** complete

### Phase 4: Renderer 与导出

- [x] 实现 timeline -> render plan -> FFmpeg
- [x] 实现 MP4/MP3/WAV/SRT/VTT export job 和 artifact
- [x] 验证时长、流、重排、词级删除和错误处理
- **Status:** complete

### Phase 5: CLI

- [x] 实现 doctor/project/transcript/timeline/edit/job/export/artifact/raw 命令
- [x] 实现稳定 JSON、stderr 进度、退出码和跨目录安装
- [x] 完成真实 CLI 端到端 smoke test
- **Status:** complete

### Phase 6: MCP

- [x] 实现 stdio tools/resources、分页和结构化错误
- [x] 编写 companion skill 和 Codex 配置示例
- [x] 完成 MCP 客户端/Agent 端到端验证
- **Status:** complete

### Phase 0–6 交付审计

- [x] 逐项核对 Phase 0–6 规划验收条件
- [x] 运行 unit/contract/integration/e2e、前端 build、安装 smoke
- [x] 更新 README、实施文档、测试报告和进度
- **Status:** complete

### Phase 7: Web UI 迁移

- [x] 新增版本化 `/api/v1` project/job/edit/export adapters
- [x] Zustand 改为 project revision + view cache + draft edit plan
- [x] 删除、词级删除、拖拽、speaker rename/merge、undo/redo、export 接入 application API
- [x] Web、CLI、MCP 轮流编辑同一 project，并验证 revision conflict
- [x] 浏览器刷新后 committed edits 不丢失，旧路由保持兼容并记录 deprecation
- **Status:** complete

### Phase 8: TTS replacement 成片

- [x] TTS provider interface、缓存与持久化 replacement artifact
- [x] `replace_speech` preview/start/apply 和 CLI/MCP/Web 试听工作流
- [x] 音频 ripple、视频 `fit_source` renderer 和 duration policy/warnings
- [x] 重启持久性、无静默截断、三入口一致性测试
- **Status:** complete

### Phase 9: 发布加固

- [x] 长文件、10+ edits、并发、失败恢复、磁盘清理测试
- [x] structured logs、diagnostics bundle、version/migrate 命令
- [x] macOS/Linux 安装、FFmpeg/模型诊断、安全与 schema 兼容审计
- [x] 文档、示例与完整 V1 验收报告
- **Status:** complete

### Web 核心链路浏览器回归

- [x] 上传音频/视频 → ASR
- [x] 字幕渲染与搜索
- [x] 句段/词级删除与拖拽排序
- [x] 说话人重命名与合并
- [x] Undo/Redo
- [x] 播放进度同步
- [x] MP4/MP3/WAV/SRT/VTT 导出
- [x] 页面身份、非空、无框架错误层、console health、截图与交互证据
- **Status:** complete

### 提交与发布门

- [x] 提交 Phase 0–6 基线
- [x] 提交 Phase 7 Web 迁移
- [x] 提交 Phase 8 TTS replacement
- [x] 提交 Phase 9 发布加固
- [x] 最终本地全量门通过
- [x] 提交 Web E2E 回归与最终文档
- [ ] push 当前分支并确认 Ubuntu/macOS CI
- **Status:** in_progress

## 已确认决策

- Python 3.11 + uv；base/mcp/web/asr-local/dev 分离依赖。
- CLI、MCP、Web 共用 application/core，不相互套壳。
- 本地优先，媒体只通过绝对路径或 artifact ID 传递。
- 所有外部编辑引用稳定 ID，写入带 expected revision、dry-run 和幂等键。
- ASR、导出作为持久化 job；重型 provider 惰性加载。
- 当前用户已有的规划文档和工作树内容保留。

## 错误记录

| 错误 | 尝试 | 处理 |
|---|---:|---|
| Phase 9 计划更新 patch 上下文未匹配 | 1 | 重新读取精确段落，按现有 Markdown 的 `- **Status:**` 形式重做定向 patch |
| Phase 9 首次 lint 停在 import 排序与嵌套 context manager | 1 | 使用定向 patch 调整 Runtime import 顺序，并合并 telemetry 的两个上下文管理器 |
| Phase 9 首次 mypy 发现 cleanup 局部变量类型被前序循环收窄 | 1 | 将删除阶段变量改为独立名称，避免 `artifact_id: str` 与 `Any | None` 复用 |
| 发布加固定向 gate 首次停在测试文件未使用 `json` import | 1 | 删除机械性残留 import 后从静态门起完整重跑 |
| 发布加固测试 3 项失败：schema 专门错误被 store 泛化，doctor golden 过期 | 1 | 在三个 canonical read 中透传 `SchemaCompatibilityError`；更新 doctor golden 的磁盘阈值与 TTS 可选诊断字段 |
| Ruff format 范围误扩到整个 `routes/`，产生 5 个 legacy 纯格式 diff | 1 | 确认这些文件起始为 clean 后，通过 `apply_patch` 精确恢复 HEAD；仅保留 `routes/api_v1.py` 的目标改动 |
| Internet Archive 公开音频 metadata 请求 20 秒超时 | 1 | 改用可直接访问的 FunASR 官方测试语音源；保持下载仅位于隔离 `/tmp`，不进入 Git |
| 检索安装 smoke 时引用了不存在的 `scripts/smoke_cli.sh` | 1 | 核对仓库后改用现有 `scripts/smoke_cli.py`；未执行任何安装或写入动作 |
| V1 版本号升至 1.0.0 后 `uv lock --check` 要求刷新 lockfile | 1 | 运行标准 `uv lock` 机械更新根包版本，再重新执行 `uv lock --check` |
| Linux Docker smoke 无法连接未运行 daemon；临时启动后 backend 持续返回 HTTP 500 | 2 | 停止并清理本次启动的 Docker 进程；新增 Ubuntu/macOS CI matrix + fresh wheel smoke，本地不虚报 Linux 通过 |
| Alpine 官方 cloud image 无代理直连仅约 13 KB/s，预计近 5 小时 | 1 | 43 秒后主动中止并保留可续传的 566 KB partial；改测国内镜像或更小的受信任 Linux 启动介质，不重复低速直连 |
| Lima `images[0]` override 命中了模板的 x86_64 条目，arm64 仍尝试官方远程镜像 | 1 | 启动前中止并检查生成配置；确认 Apple Silicon 对应 `images[1]`，删除仅本轮创建的未启动实例后用精确索引重建 |
| Linux wheel smoke 首次调用 venv Python 但未把 venv `bin` 加入 PATH，脚本找不到 `voxflow` | 1 | wheel 构建和安装均已成功；按正常安装态补 `PATH=/tmp/voxflow-linux-venv/bin:$PATH` 后重跑，不修改产品代码 |
| Linux E2E 后置证据命令使用 GNU `find -ls`，Alpine BusyBox 不支持 | 1 | VoxFlow smoke 已输出成功结果；改用 BusyBox 支持的 `find -print`、`stat -c`、`sha256sum` 和 ffprobe 单独采证 |
| 记录 BusyBox 错误的首个 patch 少写一个空格，随后一次 `rg` 双引号包含反引号导致 shell quote 错误 | 1 | 两次均未改文件；改用单引号检索精确上下文，再以定向 patch 记录 |
| Lima 2.2 `list` 不支持探查时使用的 `--all` 参数 | 1 | 改用 `limactl list`；确认唯一实例是本轮 `voxflow-v1-linux`，不影响 VM 或产品状态 |
| 临时环境清理命令因包含 `rm -f`/`rm -rf` 被安全策略整体拒绝 | 1 | 命令在执行前被拒绝，无部分清理；改为先用 Lima 自身删除 VM，再将精确临时文件/缓存移动到 macOS Trash，保持可恢复 |
| 首次 Phase 9 commit 的 staged diff check 报告 3 行 Markdown 尾随空格，但组合 shell 未 `set -e` 仍继续 commit | 1 | 去掉报告尾随空格、补计划提交状态，重新 staged check 后 amend 到同一个 Phase 9 commit |
| Web 首屏在隔离后端遇到浏览器残留 project 指针，console 记录两条 `Transcript not found` error | 1 | 恢复逻辑原本已清除 stale key；将非 URL 的预期本地恢复失败降为 info，显式 `?project=` 深链失败仍保留 error |
| 应用内浏览器对唯一隐藏 file input 的强制 click 超时，并使浏览器控制会话重置 | 1 | 不重试隐藏 locator；重新连接后改点可见上传区域触发 chooser。真实 HTML5 drag 若仍缺 API，则按 Web QA 技能切换 standalone Playwright 并明确记录 fallback |
| 应用内浏览器两条 CUA drag 路径均未触发 HTML5 drop；bundled Playwright 的默认 Chromium revision 未下载 | 2 | 保留 revision/order 未变化的失败证据；standalone Playwright 复用 Codex bundled package 并显式启动本机已安装 Google Chrome，不安装或改项目依赖 |
| standalone 持久化截图组合步骤超过 30 秒导致会话重置；干净导航发现 `/favicon.ico` 404 | 1 | 改 headless Chrome 并拆成短步骤，Revision 6/持久编辑已验证；为页面增加内联 SVG favicon，消除可控的首屏 console 404 |
| 390×844 截图显示双栏固定最小宽度被 `overflow-hidden` 裁切，数值 scrollWidth 未暴露视觉缺陷 | 1 | `<1024px` 改为主编辑区/Copilot 单列堆叠、宽度 100%、隐藏桌面 resize handles；保留桌面可调双栏 |
| 切换“连续/逐行”显示模式两次生成两个 `Restore revision 1`，把持久编辑清空 | 1 | 定位为 legacy `handleDisplayModeChange` 调用 `resetEdits()`；移除该破坏性副作用，显示模式只改 view state，显式重置按钮不变 |
| `uv sync --extra dev --extra mcp` 移除了旧 `.venv` 的 ASR/Web 包 | 1 | Makefile 改为同步 dev/mcp/web/asr-local/providers，并恢复环境；发布 base 仍保持轻量 |
| 首次 ruff 检查发现 33 个 import/格式/未使用变量问题 | 1 | 使用 ruff 自动整理 30 项，并手工修复长模型名、未使用变量和 FFmpeg 临时扩展名 |
| 首次 mypy 检查发现 6 个动态字符串/惰性可选依赖/类内 `list` 名称冲突 | 1 | 收窄 Literal、标注可选 FunASR import、显式 builtins.list 并对已验证格式做 cast |
| 系统 `python3.11` 无法 import MCP | 1 | MCP 安装在 uv 项目环境和 uv tool 隔离环境；测试/探查改用 `uv run python`，不污染系统 site-packages |
| 无音轨视频支持补丁因 `media.py` 上下文与预期不一致未应用 | 1 | 先读取实际片段，再拆分为精确补丁；该次失败未产生部分修改 |
| fixture 时长补丁因 FFmpeg 参数实际写法不同未应用 | 1 | 读取 `tests/conftest.py` 后按实际参数精确修改；该次失败未产生部分修改 |
| 旧 Flask smoke import `routes.chat` 时缺少 `openai` | 1 | `providers` extra 未完整声明旧 Web 运行依赖；补齐依赖并重同步后重跑 Web smoke |
| `uv run pytest` 收集 legacy tests 时找不到顶层 `app`/`services` | 1 | 可安装 package 不包含迁移期 legacy modules；在 pytest 配置显式加入仓库根目录 `pythonpath` 后重跑 |
| Phase 7 targeted ruff 首次检查发现 `app.py` 两处 import 排序 | 1 | 使用 ruff 安全自动整理 import，再继续 targeted contract tests |
| Phase 7 API contract 首次运行引用了仓库不存在的 `runtime`/`project` fixtures | 1 | 改为沿用既有测试模式，由 `settings`/`wav_file` 在测试内显式创建 Runtime/project |
| API edit contract 使用 legacy 数字 speaker ID 导致 preview 400 | 1 | Headless 规范 ID 为 `spk_<n>`；contract 改用 timeline 返回的稳定 speaker IDs，前端 adapter 负责显示编号映射 |
| 首次 mypy versioned route 时发现 `config.py` 两个 legacy 共享 dict 缺类型 | 1 | 为 `export_tasks`/`uploaded_files` 添加显式 `dict[str, dict[str, Any]]`，并把 v1 route 纳入 Makefile typecheck |
| 扩大 Makefile lint 范围后 `config.py` 不符合 ruff format | 1 | 对已纳入质量门的 config 执行一次机械格式化，随后重跑完整 gate |
| `config.py` format 后仍有第三方 import 分组问题 | 1 | 使用 ruff `--fix` 仅整理 import block；不重复只跑 formatter |
| 首次启动 Web E2E Flask 未注入隔离 `VOXFLOW_HOME` | 1 | 立即停止该进程，在任何 project 请求前用显式临时 home + inline jobs 重启；默认用户数据未被读写 |
| Browser runtime 不支持 `waitForLoadState(networkidle)` | 1 | 改用受支持的 `domcontentloaded`，随后以 DOM 中 project revision 的具体状态作为异步 hydrate 完成信号 |
| CUA 两种 pointer path 均未触发 HTML5 drop | 2 | 保留原 drag/drop，并补 Alt+方向键可访问重排作为可靠 UI/E2E 入口；最终另用支持原生 dragTo 的 Playwright 回归真实拖拽 |
| Browser 点击 speaker rename 后原生 `window.prompt` 未提供可控 dialog | 1 | 将 prompt/confirm 改为应用内可访问 rename/merge dialogs，提升真实 UI 可测性与可用性 |
| Phase 8 CLI speech 命令误插入 `edit_undo` 的 `if/else` 之间 | 1 | 恢复相邻分支并将 speech 命令移到函数结束后；同时移除两个临时 `type: ignore` |
| Phase 8 CLI 首次定向检查停在 Ruff format check | 1 | 对新增长参数声明执行 Ruff 机械格式化后重跑 lint、mypy、py_compile 和命令帮助 smoke |
| Phase 8 定向 mypy 发现 speech/renderer/worker 共 8 项错误 | 1 | 收窄 fake provider 参数类型与 replacement artifact 可空值；发现 ASR 主体被误移到 speech return 后，恢复到 `_transcribe` 中 |
| Phase 8 首轮 speech 集成测试 3/4 失败于 replacement clip 中间态校验 | 1 | reducer 改为通过完整 payload 一次性校验并替换 clip，避免 validate-assignment 观察到缺 artifact metadata 的非法中间态 |
| Phase 8 Web API 定向 mypy 发现 duration policy 未收窄 | 1 | 路由完成枚举校验后显式 cast 到共享语义的 Literal 类型，不使用 `type: ignore` |
| 首次启用独立 `tsc --noEmit` 发现 16 个既有严格类型问题 | 1 | 升级浏览器 target 到 ES2022，清理未使用符号、收窄 RefObject 可空签名并消除 utility 重复导出；继续重跑直到成为有效门禁 |
| Phase 8 首次全仓 `make check` 停在 2 个 Ruff 问题 | 1 | 合并 speech job 的嵌套空文本判断并整理 Runtime application import 顺序，然后从头重跑全门 |
| Browser 刷新后两次动态 audio `evaluate` 定位超时 | 2 | 改用稳定 `audio.hidden[src]` 属性核验，确认同一 persistent artifact URL 恢复；首次生成时已有实际 currentTime/duration 播放证据 |
| Browser runtime 不支持 `tab.playwright.screenshot` 和 viewport resize | 2 | 使用受支持的 `tab.screenshot()` 收集桌面证据；移动 viewport 留到最终支持视口控制的 Web E2E |
