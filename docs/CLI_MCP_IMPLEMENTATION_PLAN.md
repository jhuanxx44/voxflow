# VoxFlow CLI / MCP 完整实施方案

> 状态：建议稿 1.0  
> 日期：2026-08-04  
> 目标版本：本地优先的 VoxFlow 1.0 Headless Editing Engine

> 实施状态（2026-08-05）：Phase 0–6 已实现并完成逐项验收；最终证据见 `docs/HEADLESS_MVP_TEST_REPORT.md`。Phase 7–9 尚未实施。

## 1. 结论与推荐方案

VoxFlow 不应被改造成“内置 Codex 的聊天应用”，而应被改造成一个确定性的音视频编辑引擎：Codex、Claude 或其他 Agent 负责理解自然语言、读取 transcript、生成结构化编辑计划；VoxFlow 负责验证、预览、提交、撤销和渲染。

推荐同时提供两个入口：

- `voxflow` CLI：完整、可脚本化、稳定 JSON，方便人类、Agent、CI 和故障排查。
- `voxflow mcp serve`：stdio MCP server，作为 Codex 等模型的薄适配层。

两者直接调用同一套 Python application/core，不让 MCP 调 CLI，也不让 CLI 绕到 Flask HTTP。现有 Web UI 继续保留，并逐步改为这套 application API 的第三个适配器。

第一版采用以下默认选择：

- 本地优先，不先做多租户 SaaS。
- Python 3.11 + `uv`，复用 FunASR、TTS 和 FFmpeg 代码。
- 媒体文件通过本地绝对路径或 artifact ID 传递，不放进模型上下文。
- 项目、transcript、timeline 和 revision 持久化到本地文件系统。
- 耗时操作通过持久化 job 执行，CLI 可 `--wait`，MCP 使用 start/status 模式。
- 外部模型不需要配置进 VoxFlow；现有 Gemini 聊天仅作为 Web UI 可选能力保留。

## 2. 产品目标和边界

### 2.1 V1 必须完成的用户闭环

用户应能让 Codex 完成：

1. 导入一个本地音频或视频。
2. 执行 ASR，获得带稳定 segment ID、时间戳和说话人的 transcript。
3. 分页读取或搜索 transcript，避免一次把长音频全文塞进上下文。
4. 生成结构化 edit plan，并先 dry-run 查看影响。
5. 删除、裁剪、拆分、重排片段，修改 transcript 和说话人元数据。
6. 撤销或查看 revision 历史。
7. 导出 MP4、MP3、WAV、SRT、VTT。
8. 可选地用 TTS 替换某段语音，并真正进入最终成片。
9. 服务重启后继续读取项目、任务和导出产物。

### 2.2 V1 不包含

- 不让 VoxFlow 自己决定“应该剪什么”；这是 Agent 的职责。
- 不做 Final Cut/Premiere 级多轨视频编辑、关键帧、调色或复杂转场。
- 不在第一版做多人协作、账号、计费、云对象存储和远程 GPU 调度。
- 不通过 MCP 返回大段 base64 媒体。
- 不保证任意 TTS 长度都能无损匹配原视频画面；V1 使用明确的 duration policy。
- 不把当前 Web UI 的每个展示状态都持久化为领域状态。

### 2.3 成功指标

- 同一个 edit plan 作用于同一个 project revision，得到确定且可重复的 timeline。
- 所有写入要么完整成功，要么完全不生效。
- 错误的 revision、segment ID、时间范围或越权路径会在执行 FFmpeg 前被拒绝。
- Codex 仅依靠 MCP tool schema 和返回数据即可完成端到端粗剪。
- CLI 的 JSON 输出可作为稳定契约写测试，stdout 不混入进度日志。
- MCP、CLI 和 Web 对同一项目产生相同的编辑结果。
- 进程重启后项目和已完成 artifact 仍可访问；运行中的任务会明确标记为 interrupted 或恢复执行。

## 3. 当前代码的复用与改造范围

### 3.1 可直接复用或抽取

- `services/asr_service.py`：FunASR 初始化、模型锁和缓存思路。
- `services/media_service.py`：视频抽取音频、FFmpeg trim/concat 基础能力。
- `services/tts_service.py` 和 `routes/tts.py`：参考音频选择与 TTS 服务对接。
- `src/stores/editorStore.ts`：删除、重排、替换、undo/redo 的产品语义。
- `src/services/exportService.ts`：SRT/VTT 格式和前端导出交互经验。

### 3.2 必须重构

- 将编辑状态从 Zustand 抽为与 UI 无关的 Project/Timeline domain model。
- 将 Flask request/response 和实际 ASR、TTS、FFmpeg 逻辑解耦。
- 用稳定 UUID 替代数组下标作为外部引用。
- 用持久化 storage 替代 `uploaded_files`、`export_tasks` 内存字典。
- 将同步长请求改为 job 工作流。
- 将 TTS Blob URL 改为持久化 replacement artifact。
- 让 renderer 能混合 source clip 与 replacement audio，而不只是拼接源媒体时间段。
- 为 core、CLI、MCP 和媒体渲染建立自动化测试。

### 3.3 必须先修复的现有问题

- 对 material/source/output 路径做 canonicalization，防止 `../` 或 symlink 越界。
- `deleteByText` 不再作为写入 API；文本搜索只负责返回候选稳定 ID。
- 校验所有时间段：非负、`start < end`、不超过源媒体时长、不能是 NaN/Infinity。
- FFmpeg 始终使用参数数组，禁止 `shell=True`；限制允许的本地协议和输入类型。
- ASR 模型改为惰性加载，避免 `voxflow --help`、`doctor` 和 MCP 启动时加载 Torch 模型。

## 4. 目标架构

```text
Codex / Claude / scripts       React Web UI
          │                         │
     MCP / CLI                 HTTP / SSE
          └──────────┬──────────────┘
                     ▼
             Application Services
       project / transcript / edit / job / export
                     │
                     ▼
               Domain Core
     schemas / validation / operations / revisions
              │          │          │
              ▼          ▼          ▼
          FunASR       TTS       FFmpeg/ffprobe
              └──────────┬──────────┘
                         ▼
                Project Storage
         manifests / assets / artifacts / jobs
```

### 4.1 分层约束

- Domain 不 import Flask、Typer、MCP SDK、React 或模型 SDK。
- Application 负责用例编排、事务、锁、job 和权限，不负责输出格式。
- Infrastructure 实现 ASR/TTS/FFmpeg/storage provider。
- Interface adapters 只做参数解析、鉴权、错误映射和结果序列化。
- Web、CLI、MCP 的行为差异必须在 adapter 层解决，不复制业务逻辑。

### 4.2 推荐目录结构

```text
voxflow/
  __init__.py
  domain/
    models.py
    operations.py
    validation.py
    events.py
    errors.py
  application/
    projects.py
    transcripts.py
    edits.py
    exports.py
    jobs.py
    artifacts.py
  infrastructure/
    project_store.py
    job_store.py
    locks.py
    ffmpeg.py
    funasr_provider.py
    tts_provider.py
    hashing.py
  interfaces/
    cli/
      main.py
      output.py
    mcp/
      server.py
      tools.py
      resources.py
    web/
      blueprints.py
  schemas/
    project-v1.schema.json
    edit-plan-v1.schema.json
tests/
  unit/
  contract/
  integration/
  e2e/
  fixtures/
pyproject.toml
uv.lock
```

原有 `routes/` 和 `services/` 在迁移期继续存在，但逐步变为 wrapper，最后再删除重复实现。

## 5. 项目和持久化模型

### 5.1 默认数据目录

通过 `platformdirs` 获取默认目录，并允许 `VOXFLOW_HOME` 覆盖。测试必须总是使用临时目录。

```text
$VOXFLOW_HOME/
  catalog.sqlite
  projects/
    <project-id>/
      project.json
      transcript.json
      source/
        original.mp4
      revisions/
        000000.json
        000001.json
      replacements/
        <artifact-id>.wav
      exports/
        <artifact-id>.mp4
      logs/
  jobs/
```

规则：

- `project.json` 保存元信息和当前 revision 指针。
- `transcript.json` 是识别完成后的原始事实，默认不可变；纠错记录在 timeline revision 中。
- 每个 revision 是完整小型 snapshot；媒体本体不复制。
- `catalog.sqlite` 保存项目索引、job、artifact 元数据和幂等请求键，可从 project manifests 重建。
- manifest 使用临时文件 + fsync + atomic rename 写入。
- 每个 project 有进程间文件锁；写操作持锁，读取不阻塞或读取已提交版本。

### 5.2 源媒体导入策略

默认使用 managed ingest：

1. `ffprobe` 检查媒体类型、时长、音视频流和 codec。
2. 计算 SHA-256；相同源可复用 ASR 缓存，但每个项目有独立 timeline。
3. 支持时优先使用 copy-on-write clone/reflink；不支持时 copy。不要使用 hardlink，因为用户修改原文件会同时改变项目内媒体。
4. `--reference-source` 才保存外部路径引用，并在每次任务前校验 hash。

这样兼顾大文件性能和项目可恢复性。

### 5.3 Project v1 示例

```json
{
  "schema_version": 1,
  "id": "prj_01J...",
  "name": "访谈粗剪",
  "revision": 3,
  "created_at": "2026-08-04T10:00:00Z",
  "updated_at": "2026-08-04T10:10:00Z",
  "source": {
    "artifact_id": "art_src_01J...",
    "original_name": "interview.mp4",
    "sha256": "...",
    "duration_ms": 3600123,
    "has_video": true,
    "has_audio": true
  },
  "transcript": {
    "status": "ready",
    "model": "funasr-advanced",
    "language": "zh",
    "segment_count": 842
  },
  "timeline_revision_path": "revisions/000003.json"
}
```

### 5.4 Transcript segment

```json
{
  "id": "seg_01J...",
  "ordinal": 17,
  "start_ms": 54120,
  "end_ms": 57840,
  "text": "我觉得这个问题可以分成两部分",
  "speaker_id": "spk_1",
  "tokens": [
    {"id": "tok_01J...", "text": "我", "start_ms": 54120, "end_ms": 54280}
  ]
}
```

外部协议永远引用 `seg_*` 或 `clip_*`，`ordinal` 只用于显示。

如果 ASR provider 没有给出 token 级时间戳，该 segment 必须标记 `edit_precision="segment"`；VoxFlow 不伪造精确时间。在这种情况下 Agent 只能整段删除/移动，或显式提供经过用户确认的时间范围。

### 5.5 Timeline revision

```json
{
  "schema_version": 1,
  "project_id": "prj_01J...",
  "revision": 3,
  "parent_revision": 2,
  "created_at": "2026-08-04T10:10:00Z",
  "reason": "删除重复内容并调整开场",
  "clips": [
    {
      "id": "clip_01J...",
      "kind": "source",
      "source_segment_id": "seg_01J...",
      "source_in_ms": 54120,
      "source_out_ms": 57840,
      "transcript_text": "我觉得这个问题可以分成两部分",
      "speaker_id": "spk_1"
    }
  ],
  "speaker_labels": {"spk_1": "主持人"}
}
```

Timeline 顺序就是 clips 数组顺序；删除不修改原 transcript，只创建不含该 clip 的新 revision。

## 6. 编辑协议

### 6.1 Edit Plan v1

```json
{
  "schema_version": 1,
  "project_id": "prj_01J...",
  "expected_revision": 3,
  "client_request_id": "codex-20260804-001",
  "reason": "删除两处口癖并缩短停顿",
  "operations": [
    {
      "op": "delete_clips",
      "clip_ids": ["clip_a", "clip_b"]
    },
    {
      "op": "trim_clip",
      "clip_id": "clip_c",
      "source_in_ms": 125000,
      "source_out_ms": 128500
    }
  ]
}
```

### 6.2 V1 操作集合

| 操作 | 用途 | 关键校验 |
|---|---|---|
| `delete_clips` | 删除一个或多个 timeline clip | ID 存在且当前可见 |
| `delete_ranges` | 按同一 clip 内的起止 token 删除口癖/词句 | token 时间戳存在、顺序连续且属于该 clip |
| `move_clip` | 将 clip 移到另一个 clip 前/后 | anchor 存在，不产生重复 |
| `trim_clip` | 调整 source in/out | 范围属于原 segment/source |
| `split_clip` | 在时间点拆分 | split point 严格位于 clip 内 |
| `correct_transcript` | 只修正文字/字幕 | 明确不改变声音 |
| `rename_speaker` | 设置说话人展示名 | speaker 存在 |
| `merge_speakers` | 合并展示身份 | 不修改原 ASR speaker 事实 |
| `attach_speech_replacement` | 将已生成的 TTS artifact 挂到 clip | artifact 与源 clip fingerprint、revision 和 duration policy 匹配 |

不提供 `delete_by_text`。正确流程是：先 `transcript search` 获得候选及上下文，再显式提交 clip IDs。

`delete_ranges` 在 reducer 中规范化为 split + delete：保留删除区间前后的 source ranges。因此词级删除也使用同一套 timeline/render 语义，不保留另一份 char composition。

### 6.3 Preview 和 Apply

`edit preview` 和 `edit apply` 使用同一个验证器和 reducer：

- preview 不写磁盘，返回精确 diff。
- apply 在 project lock 内重新校验 `expected_revision`。
- 所有 operations 在内存副本上执行完并验证 invariants 后才原子提交。
- `client_request_id` 保证重试幂等；同 key、同 payload 返回原结果，不重复创建 revision。
- 同 key、不同 payload 返回 `IDEMPOTENCY_CONFLICT`。

Preview 返回：

```json
{
  "base_revision": 3,
  "result_revision": 4,
  "deleted_clip_ids": ["clip_a", "clip_b"],
  "moved_clip_ids": [],
  "duration_before_ms": 180000,
  "duration_after_ms": 173400,
  "duration_delta_ms": -6600,
  "warnings": []
}
```

### 6.4 Revision、Undo 与分支

- V1 使用线性 revision；每次 apply 生成 `revision + 1`。
- undo 不修改历史，而是以指定旧 revision 为内容创建一个新 revision。
- `edit history` 返回 reason、时间、调用来源和摘要。
- V1 不做多分支 timeline；如果未来需要多版本，增加 named variants，不复用 Git 概念暴露给用户。

## 7. TTS replacement 的媒体语义

必须区分两个操作：

- `correct_transcript`：只修字幕和文本，不改变声音。
- `speech_replace_start`：生成候选音频 artifact，但不立即改变 timeline。
- `attach_speech_replacement`：在 edit plan 中显式挂载候选 artifact，提交后才改变最终媒体。

TTS 使用两阶段流程，避免在 edit transaction 中执行外部副作用：

1. `speech_replace_start(expected_revision, clip_id, text, policy)` 创建 job。
2. job 成功后返回 replacement artifact 和建议的 `attach_speech_replacement` operation。
3. Agent 调用 `edit_preview`；如果期间 revision 已变化，VoxFlow 根据 clip fingerprint 拒绝过期候选。
4. `edit_apply` 原子提交新 revision。

### 7.1 音频项目

replacement clip 直接替换原 source clip；默认使用 TTS 的自然长度，后续 clip ripple 前移或后移。

### 7.2 视频项目

V1 默认 `duration_policy="fit_source"`：

- 保留原视频画面范围。
- TTS 音频在允许区间内做 time stretch，以匹配原 clip 时长。
- 推荐安全 stretch 比率为 0.8–1.25，超出则 preview 返回 warning，apply 默认拒绝。
- 可显式选择 `pad_or_trim`，不足补静音、过长截断；此策略必须在结果中醒目标记。

V1.1 再加入 `ripple_video`：TTS 使用自然长度，视频尾帧冻结、局部变速或后续画面 ripple。这一能力复杂度较高，不阻塞首个 MCP 版本。

### 7.3 Renderer 改造

Renderer 不再直接接收简单 segments，而接收 normalized render plan：

```json
{
  "video_tracks": [{"source": "art_src", "in_ms": 1000, "out_ms": 3000}],
  "audio_tracks": [{"source": "art_tts", "in_ms": 0, "out_ms": 2000}],
  "output": {"format": "mp4", "video_codec": "h264", "audio_codec": "aac"}
}
```

先把 timeline 编译成 render plan，再由 FFmpeg adapter 生成命令。编译器和命令生成器分别测试。

## 8. Job 与 artifact 协议

### 8.1 为什么需要 Job

ASR、TTS 和导出可能持续数十秒到数十分钟。MCP tool 不应保持一个超长调用；CLI 也需要可恢复和可查询。

### 8.2 状态机

```text
queued -> running -> succeeded
                  -> failed
                  -> cancelled
running after crash -> interrupted -> retry/failed
```

每个 job 保存：

- `id`、`kind`、`project_id`
- `status`、`progress`、`phase`
- `created_at`、`started_at`、`finished_at`
- `request` 摘要和 `result_artifact_ids`
- 结构化 error；日志文件路径
- `attempt`、`worker_pid`、幂等键

### 8.3 本地执行方式

- Application 创建持久化 job 记录。
- 本地 job runner 使用独立子进程执行，避免 MCP/CLI 父进程退出导致任务丢失。
- 子进程原子 claim job，并周期性更新 heartbeat/progress。
- 启动时扫描过期 heartbeat，将其标为 interrupted；可重试的 export/ASR 可显式 retry。
- CLI 提供 `--wait` 和 `--timeout`；MCP 默认返回 job ID，由 Agent 轮询。

### 8.4 Artifact

Artifact 是媒体、字幕、transcript 导出和预览文件的统一引用：

```json
{
  "id": "art_01J...",
  "kind": "export_video",
  "path": "/absolute/.../edited.mp4",
  "mime_type": "video/mp4",
  "size_bytes": 18203456,
  "sha256": "...",
  "created_at": "..."
}
```

MCP 返回 artifact 元数据和本地路径，不返回文件内容。远程模式未来把 `path` 替换为短期下载 URL。

## 9. CLI 契约

### 9.1 安装与运行时

采用 Python 是因为核心 ASR/TTS/FFmpeg 已经在 Python 中，迁移成本最低。要求 Python 3.11；当前 FunASR/Torch 依赖不应跟随系统 Python 3.14。

建议：

- 新建 `pyproject.toml` 和 `uv.lock`。
- `base`、`mcp`、`web`、`asr-local`、`dev` 分 dependency groups/extras。
- `project.scripts` 注册 `voxflow = voxflow.interfaces.cli.main:app`。
- 本地安装命令统一为 `uv tool install --python 3.11 '.[mcp,asr-local,web]'` 或仓库开发模式 `uv sync --python 3.11 --all-groups`。

### 9.2 命令面

```bash
# 环境
voxflow --json doctor
voxflow config show --json

# 项目与导入
voxflow project create ./input.mp4 --name "访谈" --json
voxflow project list --limit 20 --json
voxflow project get <project-id> --json
voxflow project delete <project-id> --dry-run --json

# 识别
voxflow transcript start <project-id> --model advanced --hotwords-file words.txt --json
voxflow job wait <job-id> --timeout 1800 --json
voxflow transcript get <project-id> --offset 0 --limit 100 --json
voxflow transcript search <project-id> "就是说" --context 2 --limit 20 --json

# timeline 与编辑
voxflow timeline get <project-id> --offset 0 --limit 100 --json
voxflow edit preview <project-id> --plan ./edit-plan.json --json
voxflow edit apply <project-id> --plan ./edit-plan.json --json
voxflow edit history <project-id> --limit 20 --json
voxflow edit undo <project-id> --to-revision 3 --dry-run --json

# TTS
voxflow speech replace <project-id> <clip-id> --text-file replacement.txt --dry-run --json

# 导出
voxflow export create <project-id> --format mp4 --out ./edited.mp4 --json
voxflow export create <project-id> --format srt --out ./edited.srt --wait --json
voxflow artifact get <artifact-id> --json

# Job
voxflow job get <job-id> --json
voxflow job list --project <project-id> --limit 20 --json
voxflow job cancel <job-id> --json
voxflow job retry <job-id> --json

# MCP/Web
voxflow mcp serve
voxflow web serve --host 127.0.0.1 --port 8082
```

### 9.3 JSON 输出

成功：

```json
{"ok":true,"data":{},"meta":{"request_id":"req_...","schema_version":1}}
```

错误：

```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Expected revision 3, current revision is 4",
    "retryable": true,
    "details": {"expected_revision": 3, "current_revision": 4}
  },
  "meta": {"request_id": "req_...", "schema_version": 1}
}
```

约束：

- `--json` 时 stdout 只有一份 JSON；进度和日志写 stderr。
- 所有 list/get 支持明确的 `limit`、`offset/cursor`。
- 绝不在错误中输出 API key、headers 或完整 FFmpeg 环境。
- `doctor --json` 即使缺依赖也必须正常返回诊断，而不是 import 模型时报错。

建议退出码：0 成功、2 输入错误、3 对象不存在、4 revision/lock 冲突、5 环境依赖缺失、6 job 执行失败、7配置/权限错误。

## 10. MCP 契约

### 10.1 Tools

第一版保持工具数量有限且语义明确：

| Tool | 作用 | 是否写入 |
|---|---|---|
| `doctor` | 检查 FFmpeg、存储、ASR/TTS provider | 否 |
| `project_create` | 导入媒体并创建项目 | 是 |
| `project_list` | 列出项目 | 否 |
| `project_get` | 项目摘要与当前 revision | 否 |
| `transcript_start` | 创建 ASR job | 是 |
| `transcript_get` | 分页读取 segments | 否 |
| `transcript_search` | 搜索并返回上下文和稳定 IDs | 否 |
| `timeline_get` | 分页读取当前 timeline | 否 |
| `edit_preview` | 校验 edit plan 并返回 diff | 否 |
| `edit_apply` | 提交已确认 edit plan | 是 |
| `edit_history` | 查看 revision | 否 |
| `edit_undo_preview` | 预览恢复旧 revision | 否 |
| `edit_undo_apply` | 创建恢复 revision | 是 |
| `speech_replace_start` | 创建 TTS replacement job | 是 |
| `export_start` | 创建导出 job | 是 |
| `job_get` | 查询 job/progress/error | 否 |
| `job_cancel` | 请求取消 job | 是 |
| `artifact_get` | 获取产物元数据和路径 | 否 |

删除项目、覆盖现有输出文件等破坏性动作不进入第一批 MCP tools；后续加入时必须要求显式确认参数。

### 10.2 Resources

提供轻量资源用于上下文发现：

- `voxflow://projects`
- `voxflow://projects/{project_id}/summary`
- `voxflow://projects/{project_id}/timeline/summary`
- `voxflow://jobs/{job_id}`

完整 transcript 不做单一资源，避免超出模型上下文；应使用分页 tool。

### 10.3 Tool 结果约束

- 使用 MCP `structuredContent` 返回与 CLI 相同的 data/error schema。
- 人类提示放短 text content；模型决策依赖 structured fields。
- 结果包含 `next_cursor`、`current_revision` 和推荐的下一步工具。
- 写工具返回变更摘要，不默认回传完整 timeline。
- tool error 区分 retryable 与 non-retryable。

### 10.4 Agent 推荐工作流

```text
doctor
  -> project_create
  -> transcript_start
  -> job_get until succeeded
  -> transcript_get/search
  -> timeline_get
  -> edit_preview
  -> 向用户展示摘要或按授权策略继续
  -> edit_apply(expected_revision)
  -> export_start
  -> job_get until succeeded
  -> artifact_get
```

## 11. Web API 与 UI 迁移

### 11.1 兼容策略

- 保留现有 `/asr`、`/export-media`、`/tts`，内部逐步调用 application services。
- 新增版本化 `/api/v1/projects`、`/api/v1/jobs`、`/api/v1/edits`、`/api/v1/exports`。
- React 在迁移前继续工作；每完成一条新链路就移除一份前端业务逻辑。
- 旧接口标记 deprecated 后至少保留一个版本周期。

### 11.2 Zustand 的新职责

Zustand 只保存：

- 当前 project ID/revision。
- 当前页 transcript/timeline 的 view cache。
- 选择、拖拽、播放位置、主题、弹窗等 UI 状态。
- 尚未提交的 draft edit plan。

以下状态转移到后端 project：

- composition/charComposition 的权威版本。
- speaker labels/merges。
- committed TTS replacement artifact。
- revision 和 edit history。

### 11.3 前端迁移顺序

1. 打开/创建 project 和 ASR job。
2. timeline 读取与 revision 展示。
3. 删除、重排改为构建 edit plan 并提交。
4. undo/redo 改为 revision API。
5. TTS 结果改为 artifact ID。
6. 导出改为 job + artifact 下载。
7. 删除旧的重复 store reducer 和 Blob-only 权威状态。

## 12. 分阶段实施计划

以下工期按 1 名熟悉当前代码的工程师估算，为人日，不等同于自然日。

### Phase 0：行为固化和工程基线（2–3 人日）

任务：

- 建立 `pyproject.toml`、Python 3.11 `uv.lock`、pytest、ruff、mypy/pyright 基线。
- 为当前 ASR response、FFmpeg filter、SRT/VTT 和关键编辑行为建立 characterization tests。
- 添加 5–15 秒无版权音频/视频 fixture 及预期 ffprobe 数据。
- 把 ASR/TTS 客户端改为惰性加载，确保测试无需下载模型。

验收：

- `uv run pytest` 可在没有模型 key 的机器运行 core tests。
- `npm run build` 继续通过。
- 现有 Web 基本流程不回归。

### Phase 1：Domain schema 与 Project Store（3–5 人日）

任务：

- 定义 Project、Transcript、Timeline、Clip、Revision、Artifact schema。
- 实现 ULID/UUID、schema version、atomic write、project lock。
- 实现 managed ingest、ffprobe、hash、project create/list/get。
- 建立 catalog 和 rebuild/index 检查。

验收：

- 项目可在进程重启后重新读取。
- 同源媒体可创建多个独立项目。
- 路径越界、损坏 manifest 和并发写入有明确错误。

### Phase 2：ASR Application Service（3–4 人日）

任务：

- 抽取 ASR provider interface 和 FunASR adapter。
- 把现有识别结果规范化为稳定 segment/token/speaker ID。
- 用 source hash + ASR config 作为缓存键。
- 实现 transcript pagination/search/context。
- 引入持久化 job 基础和本地 runner。

验收：

- ASR job 可查询状态，完成后 transcript 原子可见。
- 搜索结果包含 clip/segment ID 和前后上下文。
- 服务重启后 completed job 和 transcript 不丢失。

### Phase 3：确定性编辑内核（4–6 人日）

任务：

- 实现 edit plan schema、validator、pure reducer。
- 实现 delete/move/trim/split/correct transcript/speaker 操作。
- 实现 preview、apply、revision conflict、幂等键、history、undo。
- 定义 timeline invariants 和 property-based tests。

验收：

- preview 与 apply 产生相同 diff。
- 中途任一 operation 失败时不产生新 revision。
- 两个客户端基于同一 revision 写入时，后提交者收到冲突而非静默覆盖。

### Phase 4：Renderer v1（无 TTS 混编）（3–5 人日）

任务：

- timeline -> normalized render plan compiler。
- 重构 FFmpeg command builder，支持音频/视频、删除、裁剪、重排。
- SRT/VTT 依据编辑后 timeline 重新计算连续时间码。
- export job、artifact、进度和取消。

验收：

- 输出时长与 preview 的预计时长在容差内一致。
- ffprobe 验证 codec、音视频流和时长。
- 处理空 timeline、无音轨视频、极短 clip、相邻 clip 和大量 clips。

此阶段完成后，已经具备可用的 headless 粗剪内核。

### Phase 5：CLI（2–4 人日）

任务：

- 实现 Typer CLI、JSON envelope、退出码、stderr progress。
- 完成 doctor、project、transcript、timeline、edit、job、export、artifact 命令。
- 编写安装、配置和 edit plan 文档。
- 从 `/tmp` 执行安装后二进制 smoke test。

验收：

- `command -v voxflow`、`voxflow --help`、`voxflow --json doctor` 均通过。
- 一条 shell 流程能从导入 fixture 到导出 edited MP4。
- JSON contract 有 golden tests。

### Phase 6：MCP Server（2–4 人日）

任务：

- 使用官方 Python MCP SDK 实现 stdio server。
- 把 application services 映射为限定工具和资源。
- 增加分页、输出裁剪、structured error 和 job polling 指引。
- 编写 Codex/Claude 配置样例和 companion skill。

验收：

- MCP Inspector/测试客户端能列出 tools/resources。
- Codex 能在不调用 Web UI 的情况下完成导入、读取、dry-run、apply、export。
- 长 transcript 不导致单次 tool result 超限。

Phase 0–6 构成 CLI/MCP MVP，预计 19–31 人日。合理目标是 4–6 个自然周完成并稳定试用。

### Phase 7：Web UI 迁移（3–6 人日）

任务：

- 新增 `/api/v1` adapters。
- 将 Zustand 权威编辑状态改为 project revision + draft plan。
- UI 删除/拖拽/undo/export 接入 application API。
- 保留旧路由兼容并记录 deprecation。

验收：

- Web、CLI、MCP 可轮流编辑同一 project，并正确处理 revision 冲突。
- 浏览器刷新不会丢失 committed edits。

### Phase 8：TTS replacement 成片（5–8 人日）

任务：

- TTS provider interface 和持久化 replacement artifact。
- `replace_speech` preview/start/apply 工作流。
- 音频 ripple 和视频 `fit_source` renderer。
- duration/stretch/pad/trim warning 与可视化。
- 缓存键包含 provider、voice reference、text、参数和版本。

验收：

- replacement 在 CLI/MCP/Web 试听和最终导出中一致。
- 重启后 replacement artifact 仍有效。
- 视频 replacement 时长策略有测试且无静默截断。

### Phase 9：发布加固（4–7 人日）

任务：

- 性能、长文件、失败恢复、磁盘清理和并发测试。
- 结构化日志、diagnostics bundle、版本/迁移命令。
- macOS/Linux 安装验证，FFmpeg 和模型依赖诊断。
- 安全审计、文档、示例、版本发布。

验收：

- 真实 30–120 分钟素材完成 ASR、10+ edits 和导出压力测试。
- 强杀 worker、磁盘不足、FFmpeg 失败、TTS 超时均可诊断和恢复。
- 升级不会破坏 v1 project；不支持的 schema 会明确拒绝。

完整本地 V1 预计 31–52 人日，约 6–10 个自然周。若多人并行，Phase 5/6 可在 Phase 3 接口稳定后并行，Web 和 TTS 也可部分并行。

## 13. PR / 提交拆分建议

每个 PR 保持可运行、可回滚：

1. `build: add Python package, uv lock and test baseline`
2. `core: add versioned project and transcript schemas`
3. `storage: add managed ingest and atomic project store`
4. `jobs: add persistent local job runner`
5. `asr: move recognition behind provider and application service`
6. `core: add edit-plan preview and apply reducer`
7. `core: add revisions, idempotency and undo`
8. `render: compile timeline into deterministic FFmpeg plans`
9. `render: add media and subtitle export jobs`
10. `cli: add project/transcript/edit/export commands`
11. `mcp: expose bounded project and editing tools`
12. `web: add v1 API adapters and project-based editing`
13. `tts: persist replacement artifacts and render them`
14. `release: diagnostics, migration and packaging`

不要在一个 PR 中同时重写后端、迁移全部 UI 并加入 MCP；这样很难判断回归来自哪里。

## 14. 测试计划

### 14.1 Unit

- schema parse/serialize/version。
- time range、stable IDs、timeline invariants。
- 每个 operation 的 reducer、diff、幂等和 revision conflict。
- timeline -> render plan。
- render plan -> FFmpeg args；禁止使用 shell 字符串。
- subtitle 时间码重排。
- TTS duration policy。

### 14.2 Contract

- CLI 成功/错误 JSON golden files。
- MCP tool input/output schema snapshot。
- 旧 Flask API response compatibility。
- project/edit-plan JSON Schema fixtures。

### 14.3 Integration

- 临时 `VOXFLOW_HOME` 下的项目创建、重启、history、undo。
- SQLite/job runner 的 claim、heartbeat、interrupted、retry。
- 使用 5–15 秒 fixture 执行 ffmpeg/ffprobe。
- Fake ASR/TTS providers，不依赖网络或真实模型。

### 14.4 E2E

- CLI：create -> transcribe -> search -> preview -> apply -> export。
- MCP：同一完整链路并验证分页。
- Web：打开 CLI 创建的项目并继续编辑。
- TTS：replace -> restart -> export -> 检查 waveform/duration。

### 14.5 非功能测试

- 2 小时视频、1000+ segments、数百 clips。
- 10 个并发读取、2 个并发写入冲突、3 个并发 export。
- 磁盘空间不足、源文件改变、进程强杀、FFmpeg timeout。
- 中文、英文、emoji、特殊文件名、空格路径。
- MCP 返回体大小和 transcript 分页上限。

## 15. 安全与权限

- MCP 默认仅允许访问显式传入的媒体文件和 `VOXFLOW_HOME`。
- 支持 `allowed_input_roots`，远程或团队环境必须配置；拒绝不在根目录内的解析后路径。
- 检查 symlink 和 realpath，输出路径默认不得覆盖源文件。
- destructive project delete 使用 trash/soft delete；CLI 需 `--confirm`，MCP 第一版不暴露。
- 上传和 FFmpeg 输入有文件大小、时长、格式和 timeout 限制。
- 日志不记录密钥、完整 prompt audio 内容或用户原始 transcript，除非 debug 明确开启。
- `.env` 仅用于 provider 凭据；`doctor` 只报告来源和是否存在，不显示值。
- 远程 HTTP MCP 若未来启用，必须另做认证、TLS、租户隔离和 artifact 授权，不能直接暴露本地模式。

## 16. 可观测性与运维

- 每次 interface 调用生成 `request_id`；job、project、revision 和 artifact ID 贯穿日志。
- 结构化日志包含 phase、duration、exit code 和截断后的 FFmpeg stderr。
- `voxflow doctor` 检查 Python、FFmpeg/ffprobe、codec、磁盘空间、目录权限、schema、provider 配置。
- `voxflow diagnostics create --out bundle.zip` 输出脱敏配置、版本、最近错误和 job 元数据，不默认打包媒体/transcript。
- 清理采用 mark-and-sweep：未被 project revision 引用且超过 TTL 的临时 artifact 才删除。
- 导出成品默认不自动过期；preview、临时抽取音频和失败任务中间文件使用可配置 TTL。

## 17. 性能与上下文预算

- `doctor`、`--help` 不加载 ASR/Torch，目标冷启动 < 1 秒。
- `project get`、分页 transcript/timeline 目标 < 200ms（不含首次磁盘冷读）。
- edit preview/apply 是纯结构操作，1000 clips 目标 < 500ms。
- transcript 默认每页 50，最大 200；search 默认 20 个命中并带可配置上下文。
- MCP 写操作只返回 diff 摘要；完整 timeline 必须显式分页读取。
- FFmpeg 对相邻且保持原顺序的 source clips先做区间合并，减少 filter 数量。
- char-level 删除应先编译为较少的连续保留区间，避免给 FFmpeg 生成数千个 filter inputs。

## 18. 版本、兼容与迁移

- project、transcript、timeline、edit plan、CLI/MCP envelope 均有独立 `schema_version`。
- 小版本只新增 optional fields；删除/改义必须升 major schema。
- `voxflow project migrate <id> --dry-run` 展示升级内容并先备份 manifest。
- 旧浏览器 LocalStorage ASR cache 不作为新项目的权威来源；可提供一次性 `project import-transcript`，但必须重新关联和校验源媒体 hash。
- 现有 `uploaded_file_id` 可在兼容路由内部映射为 artifact/project，不继续作为新协议公开 ID。
- 旧 `/export-media` 在内部编译临时 timeline 后调用新 renderer，避免维护两套 FFmpeg 实现。

## 19. 发布门槛 Definition of Done

CLI/MCP MVP 发布前必须满足：

- Phase 0–6 验收全部完成。
- 在全新目录从安装到导出完整 smoke test 通过。
- 至少一个 Codex 真实任务通过 MCP 完成 10 分钟以上音频粗剪。
- edit apply 有 dry-run、revision、幂等和原子性测试。
- ASR/export job 重启行为明确且测试通过。
- 没有通过文本模糊匹配直接执行删除的写工具。
- 没有大媒体进入 MCP structuredContent。
- 所有本地路径入口完成 realpath/allowed-root 校验。
- README、CLI help、MCP 配置、edit plan 示例齐全。

完整 V1 发布还必须满足：

- Phase 7–9 完成。
- Web、CLI、MCP 共享同一项目和 revision。
- TTS replacement 确实进入最终导出，duration policy 可见且有测试。
- 30–120 分钟真实素材压力测试通过。

## 20. 第一轮实施建议

第一轮不要立刻写 MCP server。先用约两周完成以下纵向切片：

1. Python package/test 基线和惰性 provider。
2. `project create/get` 与 managed source。
3. fake transcript 导入和稳定 segment/clip IDs。
4. `edit preview/apply` 的 delete + move。
5. timeline -> MP3/MP4 导出。
6. 一个最小 CLI 贯通上述流程。

这条纵向切片能最早验证 Project/Timeline/Edit Plan 是否正确。协议稳定后，MCP 只是薄适配；如果一开始先暴露当前 `/asr` 和 `/export-media`，后续领域模型变化会迫使 MCP 契约重做。

## 21. 需要产品确认的少量决策

以下均已有推荐默认值，不阻塞 Phase 0–3：

| 决策 | 推荐默认值 | 影响 |
|---|---|---|
| 首发形态 | 本地 CLI + stdio MCP | 最快支持 Codex，避免云基础设施 |
| 源媒体保存 | CoW clone/reflink 优先，copy fallback | 项目可靠，避免原文件修改污染项目 |
| 视频 TTS | `fit_source`，超安全比率拒绝 | 保持口型/画面时间线，不静默变速 |
| 写操作授权 | 始终支持 preview；apply 由 Agent 按用户授权调用 | 协议安全且不绑定某个模型策略 |
| 内置 LLM | 保留为 Web 可选插件 | 不进入编辑 core |
| 云服务 | V1 后单独立项 | 需要额外 15–25+ 人日 |

## 22. 总工作量

| 交付物 | 人日估算 | 自然时间建议 |
|---|---:|---:|
| 可演示 CLI 包装现有接口 | 5–8 | 1–2 周 |
| 可靠 CLI/MCP MVP（Phase 0–6） | 19–31 | 4–6 周 |
| 完整本地 V1（含 Web 汇合与 TTS 成片） | 31–52 | 6–10 周 |
| 远程多用户服务 | 额外 15–25+ | 另立项目 |

建议把 Phase 0–6 作为当前正式立项范围。它已经能支持 Codex 对真实音视频执行可靠粗剪和导出；TTS 成片与 Web 状态统一作为紧随其后的 V1 完整阶段。
