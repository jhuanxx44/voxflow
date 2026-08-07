# VoxFlow 完整本地 V1 + Web 回归实施任务

## 目标

按照 `docs/CLI_MCP_IMPLEMENTATION_PLAN.md` 完成 Phase 0–9：在已完成的 Headless/CLI/MCP 基础上，实现 Web project/revision 迁移、TTS replacement 成片与发布加固，并完成原 Web 核心链路的真实浏览器回归。每完成一个大模块提交一次；全部验收通过后再 push。

## 当前阶段

Phase 7：Web UI 迁移

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

- [ ] TTS provider interface、缓存与持久化 replacement artifact
- [ ] `replace_speech` preview/start/apply 和 CLI/MCP/Web 试听工作流
- [ ] 音频 ripple、视频 `fit_source` renderer 和 duration policy/warnings
- [ ] 重启持久性、无静默截断、三入口一致性测试
- **Status:** pending

### Phase 9: 发布加固

- [ ] 长文件、10+ edits、并发、失败恢复、磁盘清理测试
- [ ] structured logs、diagnostics bundle、version/migrate 命令
- [ ] macOS/Linux 安装、FFmpeg/模型诊断、安全与 schema 兼容审计
- [ ] 文档、示例与完整 V1 验收报告
- **Status:** pending

### Web 核心链路浏览器回归

- [ ] 上传音频/视频 → ASR
- [ ] 字幕渲染与搜索
- [ ] 句段/词级删除与拖拽排序
- [ ] 说话人重命名与合并
- [ ] Undo/Redo
- [ ] 播放进度同步
- [ ] MP4/MP3/WAV/SRT/VTT 导出
- [ ] 页面身份、非空、无框架错误层、console health、截图与交互证据
- **Status:** pending

### 提交与发布门

- [x] 提交 Phase 0–6 基线
- [x] 提交 Phase 7 Web 迁移
- [ ] 提交 Phase 8 TTS replacement
- [ ] 提交 Phase 9 发布加固
- [ ] 提交 Web E2E 回归与最终文档
- [ ] 全部验收通过后 push 当前分支
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
| 无 | - | - |
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
