# VoxFlow CLI / MCP 规划进度

## 2026-08-07 开源发布就绪

- 用户授权在当前 `dev_edit` 连续完成法律、安全、可重复 Web E2E、README、安装统一和架构收敛；每个模块完成后独立 commit + push。
- 已读取 `planning-with-files`、前端测试调试和 Playwright 技能，运行 session catchup；权威起点为 clean `783a226`。
- 已完成首轮仓库审计并把 M10–M15、最终门和外部权限边界写入任务计划；当前进入 M10 法律合规。
- M10 已新增标准 MIT `LICENSE` 与 `THIRD_PARTY_NOTICES.md`，统一 Python/npm/README 许可证和新仓库 URL；首次 wheel 验证确认 SPDX 和 LICENSE，但 notices 未自动进入 wheel，已补 PEP 639 `license-files` 后重验。
- M10 最终验证通过：wheel metadata 为 `License-Expression: MIT`，同时包含 LICENSE 与 THIRD_PARTY_NOTICES；npm metadata 为 MIT 且所有 repository/homepage/issues URL 指向新仓库。准备独立提交并 push。
- M10 已提交并 push：`540d444 docs: establish open-source licensing`。
- M11 历史复核确认没有 `.env` blob，纠正先前误判；当前树确认有内部配置痕迹、`.DS_Store`、157 KB 识别结果和默认 `0.0.0.0` Flask 开发绑定，开始定向净化。
- M11 已删除跟踪的 `.DS_Store` 与真实识别结果；新增 SECURITY、公开内容审计、Dependabot/Gitleaks/CodeQL/dependency audit，并把 Flask/Vite 默认网络边界收紧到 loopback。首次手工 Ruff 范围误纳 legacy 文件，未做大范围格式化，仅继续验证本模块和正式质量门。
- M11 公开内容审计 228 files 通过、内部标记零命中。首次 pip-audit 卡在本机 uv Python 3.12 ensurepip 而非漏洞；npm audit 真实发现 PostCSS high advisory，正在升级锁定版本并重跑两端审计。
- M11 依赖审计闭环：npm 0 vulnerabilities，pip-audit no known vulnerabilities；GitHub Dependabot alerts/security updates/private vulnerability reporting 已启用，secret scanning/push protection 保持开启。
- M11 最终门全绿：70 tests、Ruff、mypy、229-file public audit、TypeScript、Vite build、npm audit 0、pip-audit 0；准备独立提交并 push 后观察 V1/Security workflows。
- M11 已提交并 push `0df5fa6 security: harden the public repository`。Dependabot 随后显示 npm 12 alerts 均 fixed，但全 extras 中 Flask/Torch/pytest 仍有 7 open；安全模块恢复 in-progress，开始约束升级与全 extras 审计补救。
- Flask 3.1.3、pytest 9.1.1、Torch/Torchaudio 2.10.0 已同步；70 tests/Ruff/mypy/public audit/TypeScript/Vite 全绿。全 extras pip-audit 首次只因 PyPI read timeout 退出，切换 OSV batch service 后继续。
- OSV 全 extras 剩两条 Torch 本地漏洞：一条修复版 2.13 无匹配 Torchaudio，另一条 upstream 无修复。已建立精确 ID、触发面、控制措施与 2026-09-07 到期复核的 accepted-risk；CI 只忽略这两个 ID，其余漏洞继续阻塞。
- M11 remediation 最终验证：Torch 2.10 真实 FunASR→MCP→edit→export 成功；70 tests/Ruff/mypy/public audit 全绿；全 extras pip-audit 为 0 known + 2 documented ignores。准备补救提交并 push，随后复核 Dependabot 状态。
- M11 remediation 已提交/push `7872895`；V1/Security/Dependabot graph 正在运行。首轮远端复核发现 legacy `requirements.txt` 仍产生旧 Flask/Torch alerts，需先同步安全版本，再等待 lock graph 自动关闭可修条目。

## 2026-08-07 Phase 9 发布加固

- 本轮 session catchup 已完成：确认仍在 `dev_edit`，HEAD 为 Phase 8 提交 `dc7846e`，Phase 9 工作树未提交且与交接摘要一致。
- 已确认 Lima 2.2.0 为本轮临时安装，当前无 VM；下一步使用无代理直连下载 Alpine 3.23 cloud image，在隔离 VM 内完成 fresh wheel install 与仓库外 CLI E2E，随后清理 VM、镜像缓存和本轮安装的 Lima。
- Alpine 官方镜像无代理直连 43 秒仅下载 566 KB（约 13 KB/s，预计近 5 小时），已主动中止；不会重复该失败路径，改为测速可信镜像后继续。
- USTC 镜像 27 秒完成 224 MB 下载；本地 SHA-512 `737b0e...ffd91c` 与发布 sidecar 完全一致。
- 首次 Lima override 修改了模板的 x86_64 `images[0]`，arm64 条目仍指向官方源；已在任何 VM 启动前中止，确认应改 `images[1]` 后重建临时实例。
- Alpine VM 已 READY，环境为 Linux 6.18/aarch64、Alpine 3.23.4、Python 3.12.13、FFmpeg 8.0.1；当前工作树 wheel `voxflow-1.0.0-py3-none-any.whl` 在 VM 内构建并安装成功。
- 首次 smoke 因 venv `bin` 未进入 PATH 而无法定位已安装的 `voxflow` 命令；产品尚未开始执行，记录后按常规激活态 PATH 重跑。
- Linux fresh-install E2E 已成功：doctor healthy，create→transcript import→edit→MP4 export 返回 project `prj_c4ccc1ab66554bfdb198fbc4c502f71c`、输出 10,057 bytes；仅后置 `find -ls` 因 BusyBox 方言不支持而使组合 shell 返回 1，产品链路已明确成功，继续单独采集产物证据。
- 发布报告已补充本地 Linux 镜像校验、OS/Python/FFmpeg、VM 内 wheel 构建、fresh venv、仓库外 E2E 与 ffprobe 证据；Ubuntu CI 保留为 push 后闭环，不再作为 push 前不可完成的循环依赖。
- 清理前精确核对：唯一 Lima VM 为本轮 `voxflow-v1-linux`；两个 cache URL 分别是本轮失败的 Alpine 官方下载（2.3 MB partials）和 Ubuntu cloud image（128 MB partial）；另有本轮 `/tmp` Alpine 完整镜像 224 MB。可安全按精确路径清理。
- Linux 临时 VM 已正常 stop/delete，Lima 2.2.0 已卸载。完整镜像和两个本轮 cache 按安全策略移入 macOS Trash（名称均以 `voxflow-phase9-...-20260807` 开头），可恢复；原路径与 VM 均已确认不存在。
- Linux fresh-install 缺口已关闭；开始 Phase 9 最终质量门，全部通过后才创建独立 Phase 9 commit。
- Phase 9 最终门通过：`make check` 为 69 tests passed、Ruff、mypy 38 files 全绿；schema regenerate 零差异；`npx tsc --noEmit`、Vite build（237 modules）、CLI/MCP/speech smokes、`uv lock --check`、`git diff --check` 全部通过。
- Phase 9 功能与验收报告均已完成，当前阶段切换为 Web 核心链路真实浏览器回归；先完成独立 Phase 9 commit，仍不 push。
- 发布 wheel 留下的根目录 `build/` 是本轮 22:12 生成的 340 KB staging output，不是用户源码；补入 `.gitignore` 并移入 Trash，避免后续发布构建反复污染工作树。
- Phase 9 首次 commit 为 `755b7e1 feat(release): harden VoxFlow 1.0`；staged check 同时提示新报告 3 行尾随空格，但组合命令未 fail-fast，已定向修复并准备 amend，不产生额外模块 commit。
- Phase 9 已 amend 为最终 commit `32ecb99 feat(release): harden VoxFlow 1.0`，工作树 clean，未 push。

## 2026-08-07 Web 核心链路真实浏览器回归

- 目标流：`http://127.0.0.1:3001` 首屏 → 上传真实音频/视频并完成 ASR → 字幕编辑/搜索/播放/导出 → 刷新后 committed revision 恢复，且桌面/移动端无框架错误层或相关 console error。
- QA inventory：页面身份/非空/overlay/console；音频与视频上传；advanced ASR；字幕与搜索；句段删除、稳定 token 词级删除、真实 HTML5 drag；speaker rename/merge；Undo/Redo 全周期；HTML5 media 播放进度同步；MP4/MP3/WAV/SRT/VTT 五种下载及 ffprobe/文本校验；刷新持久化；桌面 1600×900、移动 390×844 的 viewport fit 与截图。
- 探索场景：空搜索/无匹配结果；编辑 commit 期间重复操作或刷新恢复；导出菜单连续切换格式；移动端致密结果区有无横向溢出/控件遮挡。
- 预期证据：每次关键操作后的 visible revision/DOM 状态、下载事件与产物探测、desktop/mobile 截图、console warn/error 清单。
- 应用内浏览器首屏页面身份/非空通过，但隔离后端下浏览器残留 project 指针产生两条 `Transcript not found` console error；逻辑已清 key，只是把预期恢复失败错误化。已最小修改为 saved pointer 失败记 info，显式 URL 深链失败仍记 error，等待 reload 新 tab 验证。
- 新 tab 已验证修复：title/URL、服务器空闲、非空首屏、无 overlay，warn/error logs 均为空。隐藏 file input 强制 click 在应用内浏览器超时并重置控制会话；下一次从可见上传区域触发 chooser，不重复失败 locator。
- 可见上传区域 + chooser 成功载入 20 秒自然中文 WAV；advanced ASR 得到 Revision 1、9 segments、101+ token precision 字符。服务端字幕搜索“过程”命中 1 条。
- 词级删除 token“程”提交为 Revision 2；Undo Revision 3 恢复“过程”，Redo Revision 4 再次删除，完整周期通过。
- 应用内浏览器两条真实 pointer drag 路径均未触发 HTML5 drop（Revision 4、顺序不变），按技能切换 standalone Playwright；bundled package 可加载但默认 Chromium revision 未下载，改显式复用本机 Google Chrome，不安装新依赖。
- standalone Chrome 原生 `dragTo` 成功把目标段移动到开头（Revision 5），句段右键删除使 10→9 段（Revision 6）。刷新/深链后 Revision 6、拖拽顺序、词级删除和句段删除全部持久化。
- 双说话人 Web 工程：说话人 1 重命名“主讲人”至 Revision 2，说话人 2 合并后 Revision 3、badge 2→1。
- 真实 MP4 浏览器上传→advanced ASR 完成（Revision 1/9 segments）；点击 segment-2 后 video currentTime 5.96s、paused=false、active=segment-2，证明播放/字幕同步。应用内浏览器的 currentTime=0 属其媒体策略差异，不是产品 bug。
- MP4/MP3/WAV/SRT/VTT 五种 UI download 成功；ffprobe：MP4 H.264+AAC 17.960s，MP3 17.915s，WAV PCM 17.915s；SRT/VTT UTF-8 且时码连续。
- 干净页面唯一 console error 定位为浏览器自动请求 `/favicon.ico` 404；已增加内联 SVG favicon，等待 reload 后 console health 复核。媒体 source 的 `ERR_ABORTED` 发生于导航替换旧 media 请求，无页面错误。
- favicon 修复 reload 后 console/request failures 均为空。桌面 1600×900 截图通过；390×844 截图发现 fixed 双栏被内部裁切，即使 `scrollWidth=390`。已将 `<1024px` MainLayout 改为单列、100% 宽并隐藏桌面 resize handles，等待相同 viewport 复测。
- 移动复测通过：390×844 无横向滚动、0 clipped controls，主编辑区和 Copilot 单列截图完整，console 为空。
- 探索测试发现切换连续/逐行模式会调用 legacy `resetEdits()`，两次生成 Restore r1 并清空 committed edits；已移除显示模式的破坏性副作用，显式“重置编辑”按钮仍保留。
- 修复后冷启动复测连续→逐行→智能分段→连续、主题双切换、0 结果/空搜索，revision 12 前后不变且 console 为空。
- 最终 desktop revision 12、mobile revision 12、speaker merge revision 3 截图均完成视觉复核；无裁切、遮挡、横向溢出或 framework overlay。
- standalone Playwright browser 已关闭；遗留的精确 task profile root PID 39482 已 TERM 并确认全部 helper 退出。Vite/Flask 会话已 Ctrl-C 停止，端口 3001/8082 无 listener。
- V1 报告已补全真实 Web 浏览器回归环境、媒体 hash、逐项交互、导出探测、responsive 和四项修复；开始最后全量质量门。
- 最终本地发布门全绿：`make check` 为 69 tests、Ruff、mypy 38 files；schema regenerate 零差异；`npx tsc --noEmit`、Vite build、CLI/MCP/TTS smoke、`uv lock --check`、`git diff --check` 均通过。准备提交独立 Web E2E 回归收口 commit。
- Web 回归收口已提交为 `6112bd2 fix(web): complete browser regression hardening` 并 push `dev_edit`；GitHub Actions run `31191618850` 对该 SHA 的 macOS 14（1m02s）与 Ubuntu latest（1m28s）均成功，两个 job 均覆盖 Python/前端门、wheel build、fresh wheel install 和仓库外 E2E smoke。完整本地 V1 与 Web 回归目标闭环。

- Phase 8 已提交：`dc7846e feat(tts): persist and render speech replacements`（48 files，2202 insertions，250 deletions）。
- 未 push；开始按正式规划审计 Phase 9 的诊断、迁移、清理、失败恢复、并发、安装与安全验收缺口。
- planning session catchup 已恢复；权威 Git 状态为 `dev_edit` 领先远端 4 个提交，工作树只有本进度记录。
- 已将持续计划的当前阶段从 Phase 8 切换为 Phase 9；先复用既有 doctor/catalog/project store 实现 diagnostics、migration、mark-and-sweep 与 structured logs。
- 首次计划 patch 因 Markdown status 行带列表前缀而未匹配，已读取精确上下文后修正；未触及业务代码。
- Phase 9 基础实现已落盘：显式 schema compatibility、v0→v1 migration+backup、mark-and-sweep cleanup、脱敏 diagnostics zip、JSONL operational events、CLI version/migrate/diagnostics/cleanup，以及可注入的磁盘余量 job 边界。
- 首次定向 lint 仅发现 Runtime import 排序和 telemetry 嵌套 context 两项机械问题，已按规则定向修正，下一步补齐安全/兼容/恢复测试。
- Ruff 已全绿；首次 mypy 仅发现 cleanup 删除循环复用了先前已收窄的 `artifact_id` 名称，已改为独立变量。
- TTS HTTP 与轮询 timeout 现统一为 retryable `PROVIDER_TIMEOUT`，失败会立即清除 partial candidate；磁盘边界为 retryable `INSUFFICIENT_STORAGE`，可在外部状态恢复后通过 `job retry` 重新执行。
- 新增 8 个 Phase 9 集成场景与 CLI 能力发现契约；首次定向 gate 仅停在测试文件一个未使用 import，已删除并准备从头重跑。
- 定向测试首轮 9 passed / 3 failed：两项因 ProjectStore 广义异常包装吞掉专门 schema 错误，一项为 doctor golden 未纳入新增字段；已透传兼容错误并更新 golden，业务算法本身未失败。
- CLI/MCP/Web 现均将同一 request_id 写入响应与结构化事件；Web 二进制响应也带 `X-Request-ID`。
- 一次 Ruff format 范围误扩造成 5 个 legacy route 纯格式 diff；已确认这些文件在本轮开始时 clean，并通过 `apply_patch` 精确恢复 HEAD，未保留无关改动。
- 全仓 `make check` 通过：67 tests、Ruff format/check、38 source mypy 全绿。
- 长素材盘点确认既有 601 秒 smoke 是正弦波+合成 transcript，仓库没有真实媒体；Phase 9 正式压力验收将使用可追溯的公开授权真实语音，隔离下载且不进入 Git。
- 已取得 FunASR 官方 70.47 秒自然中文语音样本并核验 SHA-256；准备重复拼接为 30+ 分钟输入，验收报告将如实标明素材构成。
- 新增可复现 `scripts/stress_v1_long.py`：校验官方样本 hash、FFmpeg 拼接 30–120 分钟、真实 FunASR、12 个独立 Edit Operations、MP3 export、ffprobe duration 与 RSS/timing JSON；静态检查和 `--help` smoke 通过。
- 30 分钟 advanced FunASR 实跑完成：ASR 295.54 秒，12 operations apply 0.132 秒；首次 export 暴露 683 atrim 长图性能瓶颈。
- 已实现 audio-only 大 range graph 的单次 `asegment` 解码优化，并添加 20 个逆序 range 的真实 FFmpeg duration 测试；等待基线导出结束后执行对比复测。
- 旧 renderer 基线最终 582.744 秒；优化后同一 project/revision 仅 3.81 秒，产物 size、SHA-256、ffprobe duration 完全相同，约 153× 加速。
- detached worker 现在继承提交端全部有效 Settings，避免 FFmpeg/provider/timeout/TTL 配置漂移；新增真实进程组 SIGKILL → heartbeat interrupted → retry success 集成测试。
- 发布版本已从 0.1.0 升至 1.0.0；首次 `uv lock --check` 按预期提示根包版本变化，下一步机械刷新 lockfile 后执行 macOS/Linux fresh-install smoke。
- macOS 全新 Python 3.11 venv 从源码构建并安装 `voxflow==1.0.0` 成功；仓库外 create→import→edit→MP4 export smoke 通过，产物 10,056 bytes。
- Linux Docker 本地验证被宿主 Docker Desktop backend HTTP 500 阻断；已关闭并清理本次启动的 app/backend 进程，未改仓库/容器数据。
- 新增 GitHub Actions Ubuntu/macOS matrix：make check、前端 build、wheel build、全新 venv 安装和仓库外完整 smoke，确保 push 后 Linux 成为硬发布门。

## 2026-08-07 Phase 8 恢复与续作

- 已从 session catchup 恢复 Phase 8 未提交工作树，确认当前目标为持久化 TTS replacement 两阶段工作流。
- 修复 `voxflow/interfaces/cli/main.py` 中 speech command 打断 `edit_undo` 分支导致的语法错误。
- CLI 文本来源改为显式 `None` 分支，duration policy 经校验后 cast，移除两个临时 `type: ignore`。
- 首次定向 gate 只发现 Ruff 要求格式化新增的长 `text_file` 参数；已记录，下一步机械格式化并重跑定向链路。
- Ruff 格式化与 CLI lint 已通过；mypy 顺着 Runtime 导入发现 8 个 Phase 8 类型/结构问题。
- 定位到 `_transcribe` 的 ASR cache/recognize/save 主体被误放在 `_speech_replace` 的 return 后，已恢复函数边界；同时修复 fake duration 参数收窄和 renderer replacement artifact 可空处理。
- 新增 4 个 Phase 8 集成测试，覆盖 candidate/cache/restart、客户端 metadata 篡改、stale fingerprint、unsafe fit warning/apply reject、pad_or_trim warning 和音视频实渲染。
- 首轮测试 1 passed / 3 failed，均定位为 attach reducer 逐字段赋值产生非法 replacement 中间态；已改为一次性构造完整 clip。
- 修复后 Phase 8 speech targeted gate 通过：Ruff、mypy 全绿，4 个集成测试全部通过；已验证 WAV natural ripple 为 2.5 秒且含 replacement 波形，安全 fit_source MP4 音视频均约 2.0 秒。
- 当前未提交、未 push。下一步更新 JSON Schema 与 CLI/MCP golden contract，再完成 Web artifact 试听/preview warning/apply 工作流。
- canonical Schema 已重新生成并通过一致性测试；CLI/MCP golden contract 已加入 `speech_replace_start`，协议测试 8 passed。
- Web TTS hook 已从 legacy `/tts` Blob 切换为 persistent speech job → artifact URL → edit preview → explicit attach；新增候选试听、warning、unsafe fit 禁止应用、pad/trim 重生成和放弃 UI。
- committed replacement 在项目刷新后由 timeline artifact ID 重建播放映射；replacement artifact content 使用 inline disposition，导出 artifact 仍保持 attachment。
- Web API 定向 mypy 首次发现 duration policy 类型未收窄，已在运行时枚举校验后显式 cast，等待重跑完整定向门。
- Phase 8 全仓 gate 通过：59 tests、Ruff、34-source mypy、canonical schemas、`uv lock --check`、TypeScript strict typecheck、Vite build、`git diff --check`。
- 新增官方 stdio cross-interface smoke：CLI speech candidate → MCP preview/apply → CLI WAV export，Revision 2，ffprobe 1.72 秒。
- Browser 桌面 E2E 通过音频试听/apply/刷新恢复与视频 unsafe fit warning → pad_or_trim → apply → MP4 export；两个 tab console error/warn 均为空。
- 视频 replacement MP4 artifact `art_4834731108c444ed9e6dacef48300644` 经 ffprobe：audio 2.500s、video/format 2.520s，与 2.5s timeline 容差一致。
- Phase 8 代码与验收已闭环，下一步最终复核 diff 后提交独立大模块；仍不 push。

## 2026-08-07 完整本地 V1 Phase 7–9

- 用户要求继续实现正式规划 Phase 7–9，完成 Web 核心链路回归，每个大模块完成后 commit，全部验收通过后 push。
- 已运行 planning session catchup，并核对 HEAD、工作树、正式规划与现有 Phase 0–6 验收证据。
- 已纠正任务计划中的阶段命名，将正式 Phase 7 Web 迁移、Phase 8 TTS replacement、Phase 9 发布加固及 Web 浏览器回归纳入持续目标。
- 下一步：重新执行 Phase 0–6 当前工作树质量门，形成独立基线 commit；随后审计现有 Web 架构并实施 Phase 7。
- Phase 0–6 提交前质量门通过：`make check`（50 tests、ruff、mypy）、`npm run build`（242 modules）、`uv lock --check`、`git diff --check`。
- 正在创建 Phase 0–6 独立基线 commit。
- Phase 0–6 已提交为 `2b44672 feat: add headless editing engine and CLI MCP`（70 files，11439 insertions）。
- 已进入正式 Phase 7：Web UI project/revision 迁移。
- Phase 7 版本化 Flask adapter 首版已实现，包含 project upload/source、transcript/timeline/search、edit/restore、job/export/artifact API 和旧路由 deprecation headers。
- 新增 `tests/contract/test_api_v1.py` 覆盖 Web adapter 主契约；首次 targeted ruff 仅发现 `app.py` import 排序问题，正在修正。
- Phase 7 后端 adapter 完成：上传建 project、source range serving、transcript/timeline/search、edit preview/apply、restore、persistent jobs、五格式 export 与 artifact 下载均通过 `/api/v1` 暴露。
- Web API 已净化所有 project/job/artifact 本地绝对路径；旧 `/asr`、`/export-media` 保持工作并返回 deprecation/successor headers。
- 完整质量门通过：52 tests、ruff、mypy（含 v1 route）、`npm run build` 242 modules。
- Phase 7 React 迁移进行中：新增 typed project API client，上传/素材识别改为 project → persistent ASR job → poll → transcript/timeline hydrate。
- `editorStore` 已改为 project/revision view cache；segment/token delete、move、text correction、speaker rename/merge、undo/redo 全部编译为稳定 ID 的 server mutation，并通过串行队列避免 stale revision。
- 页面刷新会从 localStorage 的 project ID 恢复 source/transcript/timeline；导出已统一改为 persistent job + artifact download，包含 MP4/MP3/WAV/SRT/VTT。
- ResultCard 已展示 revision/sync/conflict 状态并新增 server-backed 字幕搜索；当前 production build 通过（238 modules）。
- 已启动隔离的 Flask (`VOXFLOW_HOME=/tmp/voxflow-web-e2e.*`) 与 Vite 3001 渲染环境；第一次 Flask 启动遗漏隔离环境变量，但在任何 project 请求前已停止并正确重启，未触碰默认项目数据。
- Browser rendered smoke 已通过：页面身份/非空/无 overlay/console health，CLI-created project 深链恢复为 Revision 1，媒体、两位 speaker 和字幕正确渲染。
- Browser 字幕搜索“搜索”返回 1 条；右键句段删除提交到 Revision 2；Undo 生成 Revision 3 并恢复文本，Redo 生成 Revision 4 再删除；浏览器刷新后 Revision 4 和删除结果保持，console 仍无错误。
- Browser 后续验证：词级删除 Revision 6；可访问重排 Revision 8；speaker rename Revision 9、merge Revision 10；视频字幕点击跳转并持续播放；MP3/WAV/SRT/VTT/MP4 均触发真实 artifact download。
- CLI 在 Web Revision 10 后提交 Revision 11；stale Web 写收到 conflict、自动刷新并显示外部文本。新增自动化 `test_cross_interface.py` 固化 CLI→Web→MCP→stale Web 契约。
- Phase 7 提交前完整 gate 通过：53 tests、ruff、mypy、Vite 238 modules、`git diff --check`。

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
