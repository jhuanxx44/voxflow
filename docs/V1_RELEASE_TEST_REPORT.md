# VoxFlow 1.0 发布验收报告

日期：2026-08-07
分支：`dev_edit`
版本：`1.0.0`
Project / Transcript / Timeline / Artifact / Job / Edit Plan Schema：`v1`

## 当前结论

Phase 7 Web project/revision 迁移和 Phase 8 speech replacement 已完成并分别提交。Phase 9 的诊断、迁移、清理、失败恢复、结构化日志、长文件性能、macOS/Linux 安装和发布文档已通过本地验收。

本报告会在最终 Web 浏览器回归后补充完整 UI 证据。Ubuntu fresh install 已固化为 CI 硬门；发布前的 Linux 本地实跑使用 Alpine 3.23.4 arm64 临时 VM 完成，push 后再以 Ubuntu CI 结果做第二平台闭环。

## 自动化质量门

执行：

```bash
make check
uv lock --check
npm run build
git diff --check
```

当前证据：

- `make check`：69 tests passed，Ruff format/check 全绿，mypy 38 source files 全绿（Phase 9 最终提交门，已包含长文件 renderer 优化及真实 SIGKILL 恢复测试）。
- Phase 9 定向门：14 tests passed，包含真实 FFmpeg `asegment`、磁盘不足、TTS timeout、SIGKILL、迁移、清理、诊断包和并发写冲突。
- `uv lock --check`：VoxFlow 1.0.0 lockfile 一致。
- committed schemas 重新生成后零差异；`npx tsc --noEmit` 与 `npm run build` 通过（237 modules）。
- CLI、官方 MCP、speech replacement 三条 E2E smoke 全部通过；MCP 发现 20 tools，speech candidate → attach → revision 2 → renderer 成功。
- CI：`.github/workflows/ci.yml` 在 `ubuntu-latest` / `macos-14` 执行 Python 门、前端 build、wheel build、全新 venv 安装和仓库外 E2E smoke。

## 30 分钟真实语音压力验收

可复现命令：

```bash
uv run python scripts/stress_v1_long.py \
  --minutes 30 --model advanced \
  --work-dir /tmp/voxflow-v1-long-phase9-20260807
```

素材由 FunASR 官方自然中文测试语音 `vad_example.wav` 重复拼接而成，不宣称为一段独立的 30 分钟录音：

- 官方样本：70.470625 秒，2,261,722 bytes。
- 样本 SHA-256：`a7431f0169ef76ef630c945a1d2c3675d8c8c2df2ae4a6b16f8a88ba1bccfbbb`。
- 30 分钟源：MP3，1800.000 秒，14,400,946 bytes。
- 源 SHA-256：`0342bdd4b07435a36221a0f2389755f9298ce5282e5a4af3456d421c5b46ea8a`。
- advanced FunASR：295.542 秒，895 segments。
- Edit Plan：10 个独立 delete + 1 move + 1 transcript correction；preview 0.036 秒，apply 0.132 秒，diff 完全一致。
- 编辑后：revision 2，885 clips，预期 duration 1518.807 秒。
- 峰值 RSS：5,539,201,024 bytes（模型、VAD、punc、speaker 共同驻留）。

长文件实跑暴露并修复了旧 renderer 的性能缺陷：683 个并行 `atrim` 会让每个 branch 扫描整段源文件。新实现对 16+ 个互不重叠的 audio-only ranges 使用一次 `asegment` 精确拆分，再按 timeline 顺序 concat。

| 同一 project / revision | 耗时 | 时长 | bytes | SHA-256 |
|---|---:|---:|---:|---|
| 旧 `atrim` graph | 582.744s | 1518.807s | 30,379,042 | `d24a0bf...04d5` |
| 新 `asegment` graph | 3.81s | 1518.807s | 30,379,042 | `d24a0bf...04d5` |

优化约 153 倍，产物逐字节一致。

## 失败恢复与并发

| 场景 | 诊断 | 恢复证据 |
|---|---|---|
| worker 进程组 SIGKILL | stale heartbeat → `WORKER_HEARTBEAT_LOST`, retryable | `job retry` 新 attempt 成功导出 |
| 磁盘余量不足 | `INSUFFICIENT_STORAGE`, free/min bytes, retryable | 恢复阈值后 retry 成功 |
| FFmpeg timeout | `VALIDATION_ERROR` + timeout，partial 立即删除 | 既有集成测试通过 |
| TTS timeout | `PROVIDER_TIMEOUT`, retryable，candidate partial 立即删除 | provider 恢复后 retry 成功 |
| 10 readers + 2 stale writers | 10 个读取一致；一个写成功、一个 `REVISION_CONFLICT` | revision 只增加一次 |
| stale catalog | canonical manifests 重建 project/artifact index | 既有 rebuild 测试通过 |

detached worker 现继承提交端完整有效 Settings，避免 FFmpeg、provider、timeout、磁盘阈值和 TTL 在子进程中漂移。

## 迁移、清理与诊断

- `voxflow project migrate <id> --dry-run/--apply`：支持缺失/0 → v1；apply 前按原目录结构备份；幂等。
- 高于 v1 的 manifest 返回 `SCHEMA_VERSION_UNSUPPORTED`，不会被宽泛 validation 错误吞掉。
- `maintenance cleanup` 标记所有 immutable revisions 的 replacement 引用；仅清理超 TTL 的未引用 candidate、孤儿 replacement、partial、reference 和 cache。
- source、正式 export、任一历史 revision 引用的 replacement 永不自动清理。
- diagnostics zip 只含 `manifest.json`、`config.json`、`doctor.json`、`jobs.json`、`events.json`；测试确认不含密钥 sentinel、用户 transcript、job request、本地绝对路径、媒体或原始日志。
- diagnostics 不覆盖已有输出文件。

## 安装验证

macOS 本地全新安装：

- Python 3.11.15 新 venv。
- 从源码构建并安装 `voxflow==1.0.0` + MCP extra。
- 从 `/tmp`（仓库外）运行 create → transcript import → edit preview/apply → MP4 export。
- 产物 10,056 bytes，ffprobe 同时包含 H.264 video / AAC audio，duration 1 秒。
- `voxflow version` 返回 1.0.0 / project schema v1。

Linux 本地全新安装：

- 使用 Alpine 3.23.4 aarch64 cloud image + Lima/VZ 临时 VM；镜像 SHA-512 `737b0eb365944ffcf6da477c059c105bbde222942fd5a8380c07db088365b18dbc60a0f2824ea9a3904d57e194e0d05a7074302c3ebc104d0aecb6ddc6ffd91c` 与镜像站发布 sidecar 一致。
- Linux 6.18.22 / aarch64，Python 3.12.13，FFmpeg/ffprobe 8.0.1。
- 在 VM 内从当前工作树生成 `voxflow-1.0.0-py3-none-any.whl`，安装到全新 venv；不是 editable install，也不复用 macOS 环境。
- 从 VM 的 `/tmp/voxflow-linux-smoke`（仓库外）运行 create → transcript import → edit preview/apply → MP4 export。
- smoke 返回 project `prj_c4ccc1ab66554bfdb198fbc4c502f71c`、产物 10,057 bytes；脚本内 ffprobe 断言 audio/video streams 和 1 秒时长均通过。
- `voxflow version` 返回 1.0.0 / project schema v1，`doctor` 为 healthy，required codecs 无缺失。

本机 Docker Desktop backend 曾对 `/version`、`/info` 返回 HTTP 500，因此未把 Docker 失败虚报成 Linux 产品失败；本地 Linux 证据改由上述独立 VM 获得。Ubuntu CI 仍需在 push 后实际运行成功，workflow 文件本身不算 CI 运行证据。

## Web 核心链路浏览器回归

环境：隔离 `VOXFLOW_HOME`，Flask `127.0.0.1:8082` + Vite `127.0.0.1:3001`。先使用 Codex 应用内浏览器完成首屏、上传、ASR、搜索和词级编辑；其两种 pointer drag 路径未触发 HTML5 drop 后，按 QA fallback 规则使用 bundled Playwright + 本机 Google Chrome 150 完成原生 `dragTo`、media、download 与 responsive 验证，未安装项目依赖。

测试媒体来自上述 FunASR 官方自然中文样本的前 20 秒：

- WAV：20.000 秒 / 640,112 bytes / SHA-256 `542236c2c63e214e61f9a1e3b4517018c40ea33a654f83842b8d75f71ce4fca1`。
- MP4：H.264 + AAC / 20.000 秒 / 191,620 bytes / SHA-256 `729a648c3b5ea363b986ad499e038d49e431e9f10f796708a339778f396db3b1`。

| 场景 | 浏览器实证 |
|---|---|
| 页面身份与首屏 | title/URL 正确；服务器空闲；非空；无框架 overlay；修复 favicon 后冷启动 console warn/error 为空 |
| 音频上传 → ASR | 可见上传区 + file chooser 载入 WAV；advanced FunASR 得到 revision 1、9 segments 和 token precision 字幕 |
| 字幕与搜索 | “过程”服务端搜索命中 1 条；无匹配词返回 0；空 query 禁用搜索 |
| 词级删除 | 稳定 token“程”删除后 revision 2，文本从“过程”变“过”；无数组位置写协议 |
| Undo / Redo | undo revision 3 恢复“过程”；redo revision 4 再次删除；revision 单调递增 |
| 真实拖拽 | Chrome 原生 `dragTo` 把目标段移到开头，revision 5，DOM 顺序和刷新后顺序一致 |
| 句段删除 | 右键删除后 10 → 9 segments，revision 6，文本消失且刷新后保持 |
| 说话人 | 双 speaker project 中重命名为“主讲人”至 revision 2；merge 后 revision 3、badge 2 → 1 |
| 播放同步 | 视频点击 segment-2 后 `currentTime=5.96s`、`paused=false`、active test id 仍为 segment-2 |
| 视频上传 → ASR | MP4 上传后 advanced ASR 得到 revision 1 / 9 segments，页面使用受控 video source URL |
| 五格式下载 | UI download 事件实际取得 MP4/MP3/WAV/SRT/VTT；见下方 ffprobe 结果 |
| 刷新持久性 | 深链刷新恢复拖拽、词级删除和句段删除；最终隔离工程 revision 12 保持目标时间线 |
| Responsive | 1600×900 桌面双栏通过；390×844 单列无横向滚动、0 clipped controls，主编辑区与 Copilot 均完整 |

导出探测：

- MP4：173,116 bytes，H.264 video + AAC audio，17.960 秒。
- MP3：360,868 bytes，MP3 audio，17.915 秒。
- WAV：1,580,182 bytes，PCM s16le mono，17.915 秒。
- SRT：614 bytes，UTF-8，编号与 `HH:MM:SS,mmm` 时码有效。
- VTT：604 bytes，UTF-8，以 `WEBVTT` 开头并使用点号毫秒时码。

真实回归发现并修复四项 Web 问题：浏览器 stale project 指针的预期恢复失败不再污染 error console；补内联 SVG favicon；`<1024px` 固定双栏改为单列；切换连续/逐行/智能分段不再调用 `resetEdits()` 破坏 committed revision。最后一项在隔离测试工程产生的临时 restore revisions 已通过 preview-first 恢复，不涉及用户数据。

截图与下载证据保存在隔离目录 `/tmp/voxflow-web-e2e-20260807`，未写入仓库。

## 安全审计

- 所有输入路径仍经过 realpath / allowed roots；symlink escape 有测试。
- export 不覆盖 source；diagnostics 不覆盖现有 bundle。
- FFmpeg 使用 argv list，不构造 shell 命令。
- structured events 使用字段白名单，不接受 transcript、prompt、request 或路径。
- MCP 不返回媒体 bytes；Web job/artifact 响应移除 managed path/log path。
- migration 先完整验证再加锁备份和原子写；cleanup 只操作 `VOXFLOW_HOME` 内受管文件并拒绝 symlink/outside path。

## 最终发布前剩余门

- push 后 Ubuntu CI fresh install / E2E 必须实际成功；push 前已有独立 Linux VM fresh-install/E2E 证据。
- 2026-08-07 最终本地门已通过：69 tests、Ruff、mypy（38 files）、schema 零差异、TypeScript、Vite build、CLI/MCP/TTS smoke、`uv lock --check` 与 `git diff --check` 全绿。
- 本地发布条件已经满足；提交 Web 回归收口后允许 push，远端闭环仍以 Ubuntu/macOS CI 实际成功为准。
