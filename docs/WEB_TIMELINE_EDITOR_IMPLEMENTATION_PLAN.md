# VoxFlow Web 单轨时间线编辑实施规划

> 状态：Implemented and verified（2026-08-09）
>
> 版本：1.1
>
> 日期：2026-08-09
>
> 目标版本：VoxFlow 1.x 增量功能
>
> 预估：22–31 人日；1 名熟悉仓库的工程师约 5–7 自然周（含 15% 缓冲）

> 当前实现说明：本文件仍保留开工时的阶段、工期和提交拆分，便于后续复盘和增量维护。
> 实际实现已通过文末“实施验收记录”所列自动化和真实浏览器门；segment precision source
> 因缺少可靠文本边界而明确禁用 split，token precision source 正常支持 split。

## 0. 执行摘要

这不是一次 timeline 数据模型重写，而是在现有 canonical `TimelineRevision` 和 Edit Plan
之上增加 Web 交互投影。现有 CLI、MCP、文本编辑、speaker、TTS replacement、revision、undo、
export 数据均继续有效，不做 project migration，也不引入浏览器私有工程格式。

交付节奏与人力建议：

| 交付口径 | 范围 | 预估 |
|---|---|---:|
| 可演示 rough-cut | Phase 0–4：展示、seek、split、delete、reorder | 12–17 人日 |
| 可交付首版 | Phase 0–7：再含可恢复 trim、canonical playback、冲突/性能/E2E | 22–31 人日 |
| 1 名熟悉仓库工程师 | 串行完成可交付首版 | 约 5–7 自然周 |
| 2 名熟悉仓库工程师 | Core/contract 与 Web 并行，但 Phase 1/5/6 有依赖 | 约 3–4.5 自然周，不能简单减半 |

排期置信度为中等。最大不确定项不是拖拽 UI，而是编辑后跨非连续 source/replacement clip
的受控播放，以及可恢复裁边对既有 token/text 语义的补强。若只做截图级时间线而不修这两处，
开发量会更小，但刷新、导出、preview/apply 或播放很容易出现不一致，因此不属于本规划的完成状态。

## 1. 目标

在 VoxFlow 本地 Web 中加入一条可直接操作的基础时间线。用户可以：

- 查看按成片时间连续排列的 clips；
- 移动播放头并从任意 clip 内开始播放；
- 在播放头位置切分 source clip；
- 拖动 source clip 左右边缘裁切，并在原 segment 范围内恢复已裁内容；
- 删除选中 clip，后方内容自动 ripple 前移；
- 拖拽单个 clip 到另一 clip 前后，改变播放顺序；
- 缩放和横向滚动时间轴；
- 使用既有 revision 机制撤销、重做、刷新恢复和处理并发冲突；
- 从 Web、CLI 或 MCP 继续编辑同一份 project timeline，并得到一致导出结果。

本规划交付的是单轨 compact/ripple rough-cut editor，不是多轨 NLE。

## 2. 范围锁定

### 2.1 本期必须完成

- 单条主时间线，无空隙，clips 首尾相接。
- source clip 的选择、裁边、删除和单 clip 拖拽重排；有 token 时间戳的 source clip 支持切分。
- segment precision source clip 因没有可靠的文本切分边界，首版禁用切分，避免复制或猜测拆分字幕。
- replacement clip 的显示、选择、删除和重排；首版禁止裁边和切分。
- 播放头、时间尺、缩放、横向滚动和点击 seek。
- source time 与 compact timeline time 的双向映射。
- 拖拽期间本地视觉预览，松手后一次 preview + apply。
- preview 与 apply 使用完全相同的 Edit Plan 和 `client_request_id`。
- revision conflict 后放弃临时手势、重新加载 canonical timeline 并提示用户。
- Undo/Redo 沿用 restore revision，不增加前端快照历史。
- Desktop Web 完整交互；窄屏可查看和基本操作，不要求触控优化。
- 纯函数、domain、API contract 和真实浏览器 E2E 覆盖。

### 2.2 明确不做

- 多素材导入、素材箱、多视频轨、多音频轨或音视频解耦。
- 空隙、覆盖、跨轨移动、insert/overwrite 两种模式。
- 多选组拖拽、嵌套序列、复合片段。
- 转场、特效、滤镜、渐入渐出、音量包络、关键帧。
- 波形、视频缩略图和代理媒体。
- slip、slide、roll、ripple trim 等高级工具。
- frame-accurate scrub；时间精度继续使用整数毫秒。
- Montage Web/WASM 集成或浏览器内导出。
- 修改 source media 或将浏览器状态作为持久化工程。

任何上述能力必须另开设计，不得顺手扩入本期 PR。

## 3. 完成定义

- [x] 5–120 分钟、1–1000 clips 的项目能正常展示时间线。
- [x] 用户可以完成 seek、split、trim、delete、reorder、undo 和 redo。
- [x] 每次手势最多创建一个新 revision，pointer move 不发写请求。
- [x] preview 和 apply 发送同一份序列化 Edit Plan。
- [x] split 的 preview/apply 产生相同派生 clip IDs。
- [x] 刷新页面后顺序、裁边和切分结果不丢失。
- [x] CLI/MCP 在 Web 编辑后读取到相同 revision；反向修改触发 Web 冲突恢复。
- [x] 导出媒体时长与 timeline preview 预计时长在现有容差内一致。
- [x] 失败计划不产生 revision；revision conflict 不静默覆盖修改。
- [x] `make check`、TypeScript、production build 和目标 Playwright 测试全部通过。
- [x] 真实浏览器无 console error、错误覆盖层或未处理 Promise rejection。

## 4. 现有基础与缺口

### 4.1 可以直接复用

| 能力 | 现有位置 | 结论 |
|---|---|---|
| Canonical timeline revision | `voxflow/domain/models.py` | 继续作为唯一持久化事实来源 |
| move/trim/split/delete | `voxflow/domain/operations.py` | 直接映射基础轨道操作 |
| Preview/apply/revision/idempotency | `voxflow/application/edits.py` | 不另建 Web reducer |
| Versioned Web edit endpoints | `voxflow/interfaces/web/api_v1.py` | 继续作为 Web 写入口 |
| Undo/Redo | `src/stores/editorStore.ts` + restore API | 不建浏览器 snapshot history |
| Media player | `src/components/media/MediaPlayer.tsx` | 首版继续使用 HTMLMediaElement |
| Export renderer | `voxflow/infrastructure/` | 无需第二渲染器 |

### 4.2 实施前必须补齐

1. `src/types/project.ts` 的 `EditOperationV1` 缺少 `trim_clip` 和 `split_clip`。
2. `previewEdit()` 与 `applyEdit()` 当前各自生成随机 request ID，不能保证 split 派生 ID 一致。
3. 当前 trim 只能向内缩，提交后无法把已裁内容拉回。
4. 当前 Web 播放依赖 legacy composition/index，不以 canonical clip ID 为中心。
5. 当前没有 timeline layout、viewport、playhead、gesture draft 或 pointer interaction 组件。
6. `ResultCard.tsx` 已较大，时间线逻辑必须拆到独立 feature 目录。

## 5. 固定架构

```text
用户手势
  -> Timeline gesture draft（仅内存，不持久化）
  -> stable clip IDs + source milliseconds
  -> 构造一次 EditPlanV1
  -> POST /edits/preview（不修改状态）
  -> POST /edits（完全相同 payload）
  -> application reducer 原子提交 revision N+1
  -> Web reload project/transcript/timeline
  -> canonical timeline 重新投影为 UI layout
```

### 5.1 唯一事实来源

- 后端 `TimelineRevision` 是唯一持久化 timeline。
- React 只缓存已 hydrate 的 revision、选择状态、viewport 和未提交手势。
- 不在 localStorage 保存 clip 顺序、裁边结果或工程 JSON。
- 不持久化像素坐标、数组下标、DOM ID 或 scroll position。
- 所有写操作只引用 stable `clip_*` ID 和当前 `expected_revision`。

### 5.2 为什么不增加 timeline position

首版轨道始终 compact，clip 的成片时间由前缀和唯一决定：

```ts
timelineInMs[i] = sum(durationMs(clips[0..i-1]));
timelineOutMs[i] = timelineInMs[i] + durationMs(clips[i]);
```

重排只需要改变数组顺序，删除和裁边会自然 ripple 后续 clips。增加持久化 `timeline_in_ms` 会引入重复状态和一致性问题。

### 5.3 与既有编辑数据的兼容规则

| 既有数据/操作 | 时间线交互如何兼容 | 不变量 |
|---|---|---|
| `TimelineRevision.clips` | Web hydrate 后按当前数组顺序做 prefix layout | 后端 revision 仍是唯一事实来源 |
| `move_clip` / `delete_clips` | 拖拽和 Delete 直接生成同名 Edit Plan operation | 只引用 stable clip ID，不引用数组下标 |
| `split_clip` | 子 clip 继续引用同一 `source_segment_id`，派生 ID 由同一个 request ID 确定 | preview/apply 的子 ID 必须一致 |
| `trim_clip` | payload 不变；合法边界扩展到 immutable transcript segment | clip ID 不变，transcript 本体不修改 |
| token/文本删除 | 产生的 source 子 clip 与普通 source clip 一样展示、移动和裁边 | 不把 transcript index 当 timeline identity |
| speaker rename/merge | 继续修改 revision；时间线只展示 hydrate 后 label | 不能用 `revision > 1` 判断“发生过时间线编辑” |
| TTS replacement | 可展示、删除、重排和播放；首版禁用 split/trim | replacement artifact 与 duration metadata 保留 |
| undo/redo | 继续通过 restore revision 创建新 revision | 不增加浏览器 snapshot history |
| CLI/MCP 写入 | Web 下次 reload 得到同一 canonical revision | stale Web plan 必须 conflict，不能覆盖 |

选择状态、播放头、缩放、scroll 和 pointer draft 都是临时 UI 状态。revision reload 后，仍存在的
selection 可按 clip ID 保留；不存在则清除或选择邻近 clip。任何基于旧 revision 的 gesture draft
一律丢弃。

## 6. 前端契约

### 6.1 Edit Plan 类型

在 `src/types/project.ts` 增加：

```ts
export interface EditPlanV1 {
  schema_version: 1;
  project_id: string;
  expected_revision: number;
  client_request_id: string;
  reason: string;
  operations: EditOperationV1[];
}

export interface TimelineRevisionV1 {
  schema_version: 1;
  project_id: string;
  revision: number;
  parent_revision: number | null;
  created_at: string;
  reason: string;
  source: string;
  clips: TimelineClipV1[];
  speaker_labels: Record<string, string>;
  speaker_merges: Record<string, string>;
  client_request_id: string | null;
  operation_digest: string | null;
  metadata: Record<string, unknown>;
}

export interface EditDiffV1 {
  base_revision: number;
  result_revision: number;
  deleted_clip_ids: string[];
  added_clip_ids: string[];
  moved_clip_ids: string[];
  changed_clip_ids: string[];
  duration_before_ms: number;
  duration_after_ms: number;
  duration_delta_ms: number;
  warnings: string[];
}

export interface EditPreviewV1 {
  project_id: string;
  timeline: TimelineRevisionV1;
  diff: EditDiffV1;
}

export interface EditApplyResultV1 {
  project_id: string;
  revision: number;
  diff: EditDiffV1;
  idempotent_replay: boolean;
}

export type EditOperationV1 =
  | { op: 'delete_clips'; clip_ids: string[] }
  | {
      op: 'move_clip';
      clip_id: string;
      anchor_clip_id: string;
      position: 'before' | 'after';
    }
  | {
      op: 'trim_clip';
      clip_id: string;
      source_in_ms: number;
      source_out_ms: number;
    }
  | {
      op: 'split_clip';
      clip_id: string;
      at_ms: number;
    }
  // 保留现有其他 variants
```

注意：`GET /timeline` 返回的是分页读取 DTO `TimelineV1.items`，而 `POST /edits/preview`
返回的是 domain revision snapshot `TimelineRevisionV1.clips`。两者不能继续共用一个错误的
TypeScript 类型；store 只在 hydrate 边界把它们投影为统一的 `timelineClips`。

### 6.2 API client 重构

将参数式接口改为计划式接口：

```ts
createEditPlan(projectId, revision, operations, reason): EditPlanV1
previewEditPlan(plan: EditPlanV1): Promise<EditPreviewV1>
applyEditPlan(plan: EditPlanV1): Promise<EditApplyResultV1>
```

调用方必须构造一次并复用：

```ts
const plan = createEditPlan(...);
const preview = await previewEditPlan(plan);
const result = await applyEditPlan(plan);
```

迁移现有 delete、speaker 和 TTS 调用方时不得改变既有行为。特别是 unsafe `fit_source`
仍由 preview 返回警告供候选试听，apply 明确拒绝；时间线 UI 不允许提交该候选。

### 6.3 UI 派生模型

新增 `src/features/timeline/types.ts`：

```ts
export interface TimelineLayoutItem {
  clipId: string;
  clipIndex: number;
  timelineInMs: number;
  timelineOutMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  durationMs: number;
  kind: 'source' | 'replacement';
}

export interface TimelineViewport {
  pixelsPerMs: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
}

export type TimelineGestureDraft =
  | {
      kind: 'move';
      clipId: string;
      anchorClipId: string;
      position: 'before' | 'after';
    }
  | {
      kind: 'trim';
      edge: 'in' | 'out';
      clipId: string;
      sourceInMs: number;
      sourceOutMs: number;
    };
```

Draft 只在 pointer gesture 生命周期内存在，不进入 project serialization。

## 7. 手势到 Edit Plan 的映射

### 7.1 单 clip 重排

```json
{
  "op": "move_clip",
  "clip_id": "clip_B",
  "anchor_clip_id": "clip_D",
  "position": "before"
}
```

- drop target 由目标 clip 中线决定 before/after。
- 拖到自身原位置是 no-op，不调用 API，不创建 revision。
- pointer move 只改变 provisional order；pointer up 才创建 plan。
- 首版只移动一个 clip；不得用多个 `move_clip` 模拟组移动。

### 7.2 播放头切分

```ts
const item = findLayoutItemAtTime(layout, playheadMs);
const sourceAtMs = item.sourceInMs + (playheadMs - item.timelineInMs);
```

```json
{
  "op": "split_clip",
  "clip_id": "clip_B",
  "at_ms": 18450
}
```

- 播放头必须严格位于 source clip 内部。
- 距离边缘小于 UI 最小切分距离时禁用切分。
- replacement clip 首版禁用切分并显示原因。
- 后端继续是最终合法性判断者。

### 7.3 左右裁边

```json
{
  "op": "trim_clip",
  "clip_id": "clip_B",
  "source_in_ms": 18100,
  "source_out_ms": 22400
}
```

- 左 handle 只改变 `source_in_ms`，右 handle 只改变 `source_out_ms`。
- UI 最小时长为 20ms；domain 仍以正时长为硬约束。
- 裁边使后续 clips 在 provisional layout 中即时 ripple。
- replacement clip 不显示可用 trim handle。
- 指针越界时 clamp 到 domain 可恢复 source bounds。

### 7.4 删除

```json
{
  "op": "delete_clips",
  "clip_ids": ["clip_B"]
}
```

- Delete 和 Backspace 删除当前选中 clip。
- 只剩一个 clip 时禁用删除，并解释“时间线不能为空”。
- 删除成功后优先选择右侧相邻 clip，否则选择左侧。

## 8. 可恢复裁边的 domain 改造

当前 `trim_clip` 只接受当前范围的子集。一旦提交，用户不能通过拖回 handle 恢复已裁内容。

保持 `trim_clip` schema 和 payload 不变。对 `kind == "source"` 的 clip：

1. 通过 `source_segment_id` 定位 immutable `TranscriptSegment`。
2. 合法范围改为 `segment.start_ms <= new_in < new_out <= segment.end_ms`。
3. 使用完整 `segment.tokens` 重建裁后 `token_ids` 和 `transcript_text`。
4. clip ID 保持不变；不修改原 transcript。
5. replacement clip 收到 trim 时返回明确 `ValidationError`。

这是向后兼容的行为扩展，不新增 schema 字段，不要求 project migration。

必须测试：向内裁两端、提交后向外恢复、split 后恢复、token/text 恢复、范围越界、零时长、replacement trim、preview/apply 等价和原子失败。

恢复范围以 sibling 为界（2026-10-12 修订，取代原“segment-wide restoration”）：split 或
token 删除产生的子 clip，只能向外恢复到同一 `source_segment_id` 中没有被其他 timeline clip
覆盖的 source time。也就是说，可以恢复已裁掉或已删除的内容，但不能长进 sibling 的范围；
否则同一段原始音频会在成片中播放两次，同一 token ID 也会同时出现在两个 clip 中。该边界与
timeline 顺序无关，重排后的 sibling 同样生效；缩短永远合法。Web 侧 `trimBoundsForClip` 与
domain `_trim_bounds` 使用同一规则，拖拽在本地钳制，不依赖服务端拒绝。

文本规则：裁边不改变 token 集合时（只裁静音），保留 clip 当前文本，包括手工 correction；
token 集合变化时，从 segment tokens 重建文本，恢复到完整 segment 时使用导入的 segment text。
若该 clip 带有手工 correction 且裁边会改变其词，reducer 返回 `ValidationError`，不静默丢弃
correction。segment precision clip 没有词边界，裁边始终保留 clip 当前文本。

## 9. 播放与时间映射

新增 `src/features/timeline/useTimelinePlayback.ts`，输入只接受 store hydrate 后的 canonical
`timelineClips`、派生 layout、媒体 ref 和 timeline playhead，不读取 legacy composition 数组。

对 source clip：

```ts
sourceMs = clip.source_in_ms + (timelineMs - item.timelineInMs);
```

对 replacement clip：

- 沿用受控 artifact URL 和独立 audio element；
- timeline duration 使用 `render_duration_ms`；
- 播放结束后切换到下一个 canonical clip。

播放规则：

- source 连续时允许自然播放；不连续或被重排时 seek 到下一个 `source_in_ms`。
- seek/切换期间 playhead 始终使用 timeline time。
- 点击时间轴时暂停 replacement audio，再映射并 seek 主媒体。
- reload、undo、redo 或 conflict 时停止播放并 clamp playhead。

HTMLMediaElement 首版不保证帧级无缝。如果真实素材测试显示不可接受，再单独评估 proxy 或 Montage preview。

## 10. UI 结构和文件责任

建议新增：

```text
src/features/timeline/
├── TimelineEditor.tsx
├── TimelineToolbar.tsx
├── TimelineRuler.tsx
├── TimelineTrack.tsx
├── TimelineClip.tsx
├── TimelinePlayhead.tsx
├── layout.ts
├── plans.ts
├── types.ts
├── useTimelineGesture.ts
├── useTimelinePlayback.ts
├── layout.test.ts
└── plans.test.ts
```

修改责任：

| 文件 | 责任 |
|---|---|
| `voxflow/domain/operations.py` | 可恢复 source trim 和 replacement 明确拒绝 |
| `src/types/project.ts` | 完整 Edit Plan、trim/split 和 apply result 类型 |
| `src/services/projectService.ts` | plan 构造、同 payload preview/apply |
| `src/stores/editorStore.ts` | commit orchestration、busy/conflict/reload；不放 pointer math |
| `src/components/result/ResultCard.tsx` | 只挂载 `TimelineEditor` |
| `src/components/media/MediaPlayer.tsx` | 暴露稳定 media ref/事件 |
| `package.json` / `package-lock.json` | 前端纯函数测试命令和依赖 |
| `STORE_ARCHITECTURE.md` | gesture draft 与 canonical timeline 边界 |

不得修改 `legacy_web/` 或在 `app.py` 增加编辑业务规则。

## 11. 交互规格

### 11.1 布局和 viewport

- 时间线位于播放器下方、transcript 上方。
- 工具栏包含当前/总时长、Split、Delete、Zoom out/in、Fit。
- 单轨高度 72–88px；source/replacement 使用不同且可访问的视觉样式。
- clip 显示 transcript 文本、时长和 replacement 标识；文本溢出省略。
- 缩放中心保持播放头位置；播放头不可见时以 viewport 中心缩放。
- 横向滚动、scale 和 fit 不改变 project state。

### 11.2 Pointer 与键盘

- 使用 Pointer Events + `setPointerCapture`，不使用 HTML5 drag data transfer。
- 超过 4px movement threshold 才进入 drag。
- trim handle 至少 12px 透明命中区域。
- pointer cancel、Escape、窗口失焦撤销 draft，不调用 API。
- commit 期间禁止第二个写手势，但允许滚动和查看。
- `Space` 播放/暂停；`S` 切分；Delete/Backspace 删除。
- Cmd/Ctrl+Z 和 Cmd/Ctrl+Shift+Z 沿用现有 undo/redo。
- Alt+ArrowLeft/Right 提供可访问重排路径。
- 快捷键忽略 input、textarea、select 和 contenteditable。

### 11.3 错误反馈

- validation failure：撤销 draft，保留 canonical timeline，显示具体原因。
- revision conflict：停止播放、撤销 draft、reload 最新 snapshot，提示项目已被其他入口更新。
- 网络失败：不做乐观持久化，恢复提交前 canonical UI。
- no-op：静默回到 idle，不发请求。

## 12. 分阶段实施

以下 Phase 清单保留为“从零执行/复用本规划时的操作模板”，不作为当前工作树状态；当前实现的
完成状态与证据以第 3 节和第 20 节为准。

工期按 1 名熟悉当前仓库的工程师估算；每阶段独立提交并保持可运行。

### Phase 0：契约固定与回归基线（1–2 人日）

- [ ] 为 move/trim/split/delete 补齐 API contract。
- [ ] 增加相同 request ID 下 split preview/apply 派生 ID 一致测试。
- [ ] 记录当前 delete/reorder/undo E2E 基线。
- [ ] 补全 `EditPlanV1`、trim/split 和 apply result 类型。
- [ ] 建立 `npm run test:unit`；如采用 Vitest，同步 package 和 lock，后续统一 `npm ci`。
- [ ] 修正 preview snapshot 类型：`timeline.clips` 不得误写为分页 DTO 的 `timeline.items`。
- [ ] E2E server/browser storage 在首次导航前初始化；backend/proxy 统一使用 `127.0.0.1`。
- [ ] Playwright `reuseExistingServer` 改为显式 opt-in，避免测试误连开发者正在运行的 backend。

验收：现有行为不变；类型与 domain 字段一致；Python、TypeScript 和 build 门通过。

提交：`test: lock timeline edit contracts`

### Phase 1：同一 Edit Plan 的 preview/apply（2–3 人日）

- [ ] 实现 create/preview/apply plan API。
- [ ] preview/apply 复用同一个 plan 和 request ID。
- [x] 保持既有 TTS 契约：unsafe `fit_source` preview advisory、apply strict reject；时间线正常提交仍 paired preview/apply。
- [ ] 迁移 store、TTS、speaker 和删除调用方。
- [ ] commit 状态收敛为 idle → previewing → applying → reloading。
- [ ] 保留 conflict reload 和 undo/redo。

验收：请求 body 深度相等；split IDs 相同；幂等冲突正确；现有 Web E2E 通过。

提交：`web: reuse one edit plan for preview and apply`

### Phase 2：纯布局模型与静态时间线（3–4 人日）

- [ ] 实现 prefix layout、timeline/source mapping 和二分查找。
- [ ] 实现 scale、scroll、fit 和 visible range。
- [ ] 创建 Ruler/Track/Clip/Playhead 静态组件。
- [ ] 只从 canonical items 渲染。
- [ ] 实现单选、点击时间尺 seek 和当前时间。
- [ ] 对 1000 clips 使用 visible range overscan。

验收：layout 无重叠/空隙；最后 out 等于 duration；replacement duration 正确；坐标映射误差不超过 1ms 取整误差。

提交：`web: render canonical compact timeline`

### Phase 3：播放头、切分和删除（3–4 人日）

- [ ] 支持点击/拖动播放头和 viewport 跟随。
- [ ] timeline time 转 clip/source time。
- [ ] 实现 toolbar 和 `S` 切分。
- [ ] 实现 Delete/Backspace 和删除后选择。
- [ ] replacement、边缘切分、最后 clip 删除显示禁用原因。
- [ ] 所有手势走 Phase 1 pipeline。

验收：split ranges/duration/IDs 正确；删除 ripple；不能空 timeline；undo/redo/刷新正确。

提交：`web: add playhead split and ripple delete`

### Phase 4：单 clip 拖拽重排（3–4 人日）

- [ ] 实现 pointer capture、threshold 和 provisional order。
- [ ] 用目标 clip 中线计算 stable anchor + before/after。
- [ ] pointer-up 生成一个 `move_clip` plan。
- [ ] Escape/pointercancel/blur 取消。
- [ ] 实现 Alt+Arrow 可访问替代。
- [ ] no-op drop 不请求 API、不新增 revision。

验收：向前/后/首/末/相邻/no-op 正确；zoom/scroll 下目标一致；pointer move 无写请求；一次 drop 一个 revision；Playwright 覆盖鼠标和键盘路径。

提交：`web: add stable-id clip reordering`

### Phase 5：可恢复裁边（4–5 人日）

- [ ] Domain trim 使用 immutable transcript segment bounds。
- [ ] 使用完整 segment tokens 重建 token IDs/text。
- [ ] replacement trim 返回明确错误。
- [ ] 实现左右 handles、clamp、最小时长和 provisional ripple。
- [ ] pointer-up 生成一个 `trim_clip` plan。
- [ ] 增加 domain/property/API/Web 测试。

验收：向内裁和向外恢复成功；不越界/不零时长；文本、字幕、duration 和媒体导出一致；非法计划原子失败。

提交：`core: support reversible source clip trims`

### Phase 6：Canonical timeline 播放（3–4 人日）

- [ ] 实现 `useTimelinePlayback`。
- [ ] 从任意 playhead 播放并跨非连续 source clips seek。
- [ ] 支持 replacement artifact 切换。
- [ ] 播放进度反映射为 timeline playhead。
- [ ] reload/undo/redo/conflict 时停止并 clamp。
- [ ] legacy highlight 只做显示兼容，不成为数据源。

验收：所有编辑后的播放顺序正确；source/replacement/source 可结束；不进入删除范围；无重复 RAF/listener。

提交：`web: play canonical timeline clips`

### Phase 7：打磨、性能与交付门（3–5 人日）

- [ ] 补 toolbar 状态、tooltip、focus ring、ARIA 和主题。
- [ ] 验证 1000 clips、长时间轴、极短 clip 和快速连续操作。
- [ ] 增加 conflict、网络失败和 pointer cancel E2E。
- [ ] 更新 Store architecture、README 功能和快捷键。
- [ ] 运行完整 Python/TS/build/E2E/真实浏览器门。
- [ ] 检查用户媒体、runtime project 和测试产物未进入 Git。

验收：完成第 3 节；desktop 无 console error；390px 页面不被整体裁切；不修改 legacy Web，不引入第二 reducer。

提交：`web: harden single-track timeline editor`

## 13. 测试计划

### 13.1 Domain unit/property

目标：`tests/unit/test_models_and_operations.py`、`tests/property/test_timeline_invariants.py`。

覆盖 move 首/中/末、split duration/IDs、trim inward/outward 和 token 恢复、replacement trim、最后 clip 删除、operation 原子失败。

现有 unit fixture 若让 clip 引用超出其 `source_segment_id` 边界的范围，必须先修成合法 fixture
（例如增加第二个 segment），不得为了迁就测试绕过新的 segment-bound validation。

### 13.2 API contract

目标：`tests/contract/test_api_v1.py`。

覆盖 preview 不写 revision、相同 plan 的 diff/IDs、stale revision、相同 request 的 replay、不同 payload 的 idempotency conflict。

### 13.3 Frontend unit

目标：`src/features/timeline/layout.test.ts`、`plans.test.ts`。

覆盖 prefix layout、timeline/source 映射、pixel/time、visible range、drop anchor、no-op、trim clamp 和 operation 生成。

### 13.4 Playwright E2E

新增 `e2e/timeline-editor.spec.ts`，至少覆盖：

1. 打开视频并看到 clip 数、duration、revision。
2. 点击时间尺，播放器 seek 且 playhead 更新。
3. 切分后 revision +1，刷新后两个 clips 存在。
4. 向内裁边，再向外恢复。
5. 拖动重排，刷新后顺序保持。
6. no-op drag 不改变 revision。
7. 删除、undo、redo 和刷新一致。
8. stale revision 后 reload 最新 canonical timeline。
9. replacement clip 的 trim/split disabled。
10. 导出并验证媒体时长/流。

### 13.5 手工真实浏览器

用 `./start.sh` 启动锁定 Web 栈，验证短 fixture、5–10 分钟真实媒体和 30–120 分钟/大量 clips fixture。记录浏览器版本、revision、操作序列、console、截图和 ffprobe；用户媒体与 runtime project 不进入仓库。

## 14. 性能预算

| 场景 | 目标 |
|---|---:|
| 1000 clips 初次纯 layout | < 20ms（生产构建、常规开发机） |
| pointer move handler | 单帧脚本目标 < 8ms |
| scroll/zoom | 主观保持 50–60fps，不因网络调用阻塞 |
| seek UI 响应 | 点击后 100ms 内更新视觉 playhead |
| no-op gesture | 0 API requests，0 revisions |
| committed gesture | 1 preview + 1 apply + 1 bounded reload |

- layout 可 O(n)，但不得在每个 clip render 中重复计算前缀和。
- pointer move 不写 Zustand canonical state；使用局部 draft/ref + RAF 合帧。
- 只渲染 visible clips + overscan；不为全部 tokens 展开 DOM。
- 禁止为每个 clip 单独请求媒体、transcript 或 preview。

## 15. 提交顺序

1. `test: lock timeline edit contracts`
2. `web: reuse one edit plan for preview and apply`
3. `web: render canonical compact timeline`
4. `web: add playhead split and ripple delete`
5. `web: add stable-id clip reordering`
6. `core: support reversible source clip trims`
7. `web: play canonical timeline clips`
8. `web: harden single-track timeline editor`

不要把 domain trim、完整 UI 和播放重写压在一个 PR 中。

## 16. 每阶段执行协议

阶段开始：

1. 阅读本 Phase、`AGENTS.md`、相关 contract/schema/tests。
2. 执行 `git status --short`，保留用户现有改动和未跟踪文件。
3. 只改本阶段责任文件；范围外缺口先记录。
4. 先补失败测试或 characterization test，再改行为。

阶段结束：

```bash
git diff --check
uv run pytest tests/unit/test_models_and_operations.py \
  tests/property/test_timeline_invariants.py \
  tests/contract/test_api_v1.py
npm run test:unit
npx tsc --noEmit
npm run build
```

Phase 2–7 追加：

```bash
npm run test:e2e -- e2e/timeline-editor.spec.ts
```

最终门：

```bash
make check
npm run test:unit
npx tsc --noEmit
npm run build
npm run test:e2e
```

修改 dependency direction 或移动模块时追加 `make architecture-audit`。构建通过不等于运行时通过，Phase 2–7 必须提供真实浏览器证据。

## 17. 风险与应对

| 风险 | 触发信号 | 应对 |
|---|---|---|
| preview/apply ID 不一致 | split preview IDs 与 apply 不同 | Phase 1 重构 plan API，E2E 深比较请求体 |
| revision 风暴 | 一次拖动 revision 增长多次 | 写请求仅绑定 pointer-up，no-op 断言 0 请求 |
| React 出现第二 timeline | 刷新后 UI 与 CLI/MCP 不一致 | canonical 只来自 hydrate；draft 不跨手势 |
| trim 无法恢复 | handle 只能继续向内 | 使用 immutable segment bounds + 完整 tokens |
| replacement 语义混淆 | trim 出现非法中间态 | UI 禁用且 domain 明确错误 |
| HTML media seek 卡顿 | 重排边界明显停顿 | 记录真实指标，另开 proxy/Montage 计划 |
| 1000 clips 卡顿 | scroll/drag 掉帧 | visible range、RAF 合帧、单次 layout |
| 并发覆盖 | Web 提交 Agent 修改前的布局 | conflict 后 discard draft + reload |
| ResultCard 膨胀 | 时间线逻辑进入千行组件 | 独立 feature，ResultCard 只 composition |

## 18. 延后项进入条件

- 波形需要 server-side peak artifact/schema 和缓存设计。
- 缩略图需要持久化 thumbnail artifact/job 和采样策略。
- 多选组拖拽需要原子 `move_clips` operation。
- 空隙/任意位置需要 timeline schema v2 的 placement/track 模型。
- 多轨需要 domain、renderer、字幕和全部 adapters 的统一 schema。
- Montage 只能作为 canonical timeline 的瞬态编译目标，且发布前需确认构建、浏览器和许可边界。

## 19. 立即开工清单

1. [x] 在既有 `dev_edit` 分支确认工作树边界；未擅自创建或切换分支。
2. [x] 为 Web `EditOperationV1` 补 trim/split 类型。
3. [x] 在 API contract 写下相同 plan preview/apply 的 split ID 断言。
4. [x] 建立前端纯函数测试命令和 timeline feature 目录。
5. [x] 完成 Phase 0 全部门；提交动作不属于本次授权，保留给维护者。
6. [x] 消除 preview/apply 双 request ID，并完成 Phase 1–7。

首个可演示里程碑是 Phase 4 完成：用户可看到时间线、移动播放头、切分、删除和拖拽重排。首个可交付里程碑是 Phase 7 完成：裁边可恢复、播放正确、冲突可恢复、全门通过。

## 20. 实施验收记录（2026-08-09）

### 20.1 自动化证据

| 门 | 结果 |
|---|---|
| `make check` | 通过；91 个 Python 测试，Ruff、mypy、skill/public/architecture audit 全绿 |
| `npm run test:unit` | 通过；3 files / 12 tests（含 1000 clips 平均布局预算、4px 阈值和 trim/move 边界） |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | 通过；Vite 247 modules |
| `npm run test:e2e` | 通过；7 passed，7 个按 desktop/mobile project matrix 预期 skip |
| `git diff --check` | 通过 |

本机 Playwright managed Chromium 未安装，因此最终本地 E2E 使用
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
回退；CI 仍按工作流安装 pinned Chromium。该回退不改变测试代码或产品行为。

### 20.2 契约与交互证据

- API contract 证明 split preview 不落 revision、preview/apply 派生 ID 相同、apply 后 GET 持久化一致、幂等 replay 与冲突正确。
- 浏览器拦截证明正常 timeline commit 恰好一份 preview 和一份 apply，request body 与 request ID 深度相等；pointer release 前没有写请求，revision 精确增加 1。TTS candidate 的 advisory preview/strict apply 保持既有例外语义。
- E2E 覆盖 seek、token-precision split、双向可恢复 trim、delete、pointer/Alt+Arrow reorder、undo/redo、刷新恢复、preview/apply 网络失败和外部 revision conflict。
- canonical playback 覆盖 source、replacement 到下一 source、原生媒体 pause 接管；导出 MP4 时长与 UI clip duration 误差小于 200ms。
- Web 写入 Revision 2 后，公开 CLI `timeline get` 读取到同一 revision、clip ID 和 speaker label；随后 MCP 写入 Revision 3，stale Web 写收到 409 并 reload canonical state。
- 1000 clips 的 prefix/visible-range 纯函数测试通过；100 次 `layout + visibleRange` 的平均耗时低于 20ms 门槛。
- 真实浏览器加载 120 分钟/1000 clips 的有效 FLAC project：可交互时间线 652ms 内出现，显示 `Revision 1 · 1000 clips` 和 `02:00:00`；Fit 模式 0 clip overlap。
- 大项目放大后内部轨道宽 117,726px，仅渲染 7 个 visible/overscan clips；横向滚动至 5,000px 后渲染 9 个，未发编辑请求。键盘 seek 的端到端浏览器往返为 65ms。

### 20.3 真实浏览器与视觉核对

桌面默认视口与窄屏 390px 均使用确定性媒体完成真实渲染并人工查看：

1. 时间线位于现有 ResultCard 顶部，复用背景、边框、按钮和主题变量，没有形成第二套视觉系统。
2. 桌面四个 clips 连续铺满 compact track，时间尺、播放头、选中环和 Ripple 标识可辨识。
3. 390px 下 `document.scrollWidth == innerWidth == 390px`，toolbar 自动换行；时间线视口 322px、内部内容 560px，仅在自身容器横向滚动。
4. source 与 replacement 使用不同语义色；replacement 不显示 trim handles，segment-precision split 禁用。
5. 短项目完成时间尺 ArrowRight seek、ripple delete（Revision 1→2）和 restore undo（Revision 3）；页面无 Vite error overlay、console error/warning 或未处理 Promise。
6. 两小时/1000 clips 项目放大、滚动和 seek 后仍无 console error/warning；密集 Fit 下小于 2px 的 clip 不绘制会扩大盒宽的边框，避免视觉重叠。

真实浏览器画面在本次验收会话中直接审阅，未将截图、用户媒体或 runtime project 写入仓库。
测试生成的 120 分钟 FLAC 位于 `/tmp`，验收后已删除；隔离服务器退出时清理 project home。

### 20.4 明确边界

- segment precision clip 缺乏可靠 token/text 边界，首版禁止 split；不复制完整文本，也不做字符比例猜测。
- trim 恢复以同 segment sibling 为界，不产生 source overlap；会改变已校对 clip 词集合的 trim 被拒绝（2026-10-12 修订，见 §8）。
- unsafe `fit_source` 保持既有 TTS 行为：candidate/preview 给 advisory warning，apply strict reject，UI 禁止提交。
- 未加入多轨、空隙、多素材、波形、缩略图、特效、fade、关键帧或 Montage Web/WASM。
