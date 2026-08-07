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

## 安全审计

- 所有输入路径仍经过 realpath / allowed roots；symlink escape 有测试。
- export 不覆盖 source；diagnostics 不覆盖现有 bundle。
- FFmpeg 使用 argv list，不构造 shell 命令。
- structured events 使用字段白名单，不接受 transcript、prompt、request 或路径。
- MCP 不返回媒体 bytes；Web job/artifact 响应移除 managed path/log path。
- migration 先完整验证再加锁备份和原子写；cleanup 只操作 `VOXFLOW_HOME` 内受管文件并拒绝 symlink/outside path。

## 最终发布前剩余门

- push 后 Ubuntu CI fresh install / E2E 必须实际成功；push 前已有独立 Linux VM fresh-install/E2E 证据。
- 完成真实浏览器 Web 核心链路回归：上传音频/视频 → ASR、字幕/搜索、句段/词级删除、真实拖拽、speaker rename/merge、Undo/Redo、播放同步、MP4/MP3/WAV/SRT/VTT 下载。
- Web 回归完成后再执行一次最终 Python、TypeScript、Vite、schemas、CLI/MCP smoke、`uv lock --check`、`git diff --check`，防止回归测试/文档收口引入变化。
- 上述全部通过后才允许 push。
