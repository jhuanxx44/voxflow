# Store 架构概览

## Store 层级

```
┌─────────────────────────────────────────────────────────────────┐
│                         应用状态                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼────────┐    ┌────────▼────────┐    ┌──────▼──────┐
│  editorStore   │    │    asrStore     │    │   uiStore   │
│   (编辑器)     │    │    (识别)       │    │    (UI)     │
└────────────────┘    └─────────────────┘    └─────────────┘
```

## Store 职责

### editorStore（编辑器核心逻辑）

```
┌────────────────────────────────────────────────────┐
│              editorStore                           │
├────────────────────────────────────────────────────┤
│ 识别结果                                           │
│  • lastFullText         原始识别文本               │
│  • lastSegments[]       段落数组                   │
│  • charLevelData[]      逐字数据                   │
├────────────────────────────────────────────────────┤
│ Composition（编辑核心）                            │
│  • composition[]        段落索引数组               │
│  • charComposition[]    字符索引数组               │
├────────────────────────────────────────────────────┤
│ 智能分段                                           │
│  • smartParagraphGroups[][]                        │
│  • isSmartParagraphManuallyEdited                  │
├────────────────────────────────────────────────────┤
│ 说话人管理                                         │
│  • speakerNames         说话人名称映射             │
│  • speakerMerges        说话人合并映射             │
├────────────────────────────────────────────────────┤
│ 模式                                               │
│  • isCharEditMode       是否逐字编辑               │
│  • displayMode          显示模式                   │
├────────────────────────────────────────────────────┤
│ 编辑状态                                           │
│  • hasEdited            是否已编辑                 │
│  • insertAfterIndex     插入位置                   │
│  • dragSrcIdx           拖拽源索引                 │
├────────────────────────────────────────────────────┤
│ 播放状态                                           │
│  • editedPlaying        编辑后播放中               │
│  • editedPlayPos        播放位置                   │
└────────────────────────────────────────────────────┘
```

### asrStore（ASR 识别状态）

```
┌────────────────────────────────────────────────────┐
│                asrStore                            │
├────────────────────────────────────────────────────┤
│ 文件状态                                           │
│  • currentFile          上传的文件                 │
│  • currentMaterial      素材库选择                 │
│  • audioUrl             播放 URL                   │
│  • mediaType            媒体类型 (audio/video)     │
├────────────────────────────────────────────────────┤
│ 识别状态                                           │
│  • isRecognizing        是否识别中                 │
│  • recognitionMode      识别模式 (basic/advanced)  │
│  • hotwords             热词配置                   │
│  • usedHotwords         上次使用的热词             │
├────────────────────────────────────────────────────┤
│ 服务器状态                                         │
│  • serverStatus         {waiting, processing}      │
├────────────────────────────────────────────────────┤
│ 缓存                                               │
│  • cacheEnabled         是否启用缓存               │
└────────────────────────────────────────────────────┘
```

### uiStore（UI 状态）

```
┌────────────────────────────────────────────────────┐
│                 uiStore                            │
├────────────────────────────────────────────────────┤
│ 主题                                               │
│  • theme                dark/light                 │
├────────────────────────────────────────────────────┤
│ 右键菜单                                           │
│  • contextMenu          {visible, x, y, index}     │
└────────────────────────────────────────────────────┘
```

## 数据流

### ASR 识别流程

```
用户上传文件/选择素材
        │
        ▼
┌───────────────┐
│   asrStore    │
│ setCurrentFile│
│ setMediaType  │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  asrService   │
│ recognizeASR  │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ editorStore   │
│setRecognition │
│    Result     │
└───────────────┘
```

### 说话人合并流程

```
用户右键点击说话人标签
        │
        ▼
ResultCard 显示说话人菜单
        │
        ▼
用户选择「合并到: 说话人X」
        │
        ▼
┌───────────────┐
│ editorStore   │
│ mergeSpeaker  │──► 更新 speakerMerges
└───────┬───────┘
        │
        ▼
SentenceSpan 使用 getEffectiveSpeaker()
计算显示颜色
```

### 编辑流程

```
用户执行编辑操作（删除/排序等）
        │
        ▼
┌───────────────┐
│ editorStore   │
│   Actions:    │
│ • deleteAtPosition    │
│ • reorderComposition  │
│ • deleteByText        │
│ • replaceText         │
└───────┬───────┘
        │
        ▼
composition/charComposition 更新
hasEdited = true
        │
        ▼
组件重新渲染
```

## 核心概念

### Composition 数组

`composition` 和 `charComposition` 数组是编辑功能的**核心**：

- 它们存储的是指向 `lastSegments` 或 `charLevelData` 的**索引**
- 重排序 = 改变 composition 中的索引顺序
- 删除 = 从 composition 中移除索引
- 原始数据**永不修改**，只改变索引映射

示例：
```
原始 segments: ["A", "B", "C", "D"]
初始 composition: [0, 1, 2, 3]

删除 "B" 后: [0, 2, 3]
重排序后: [0, 3, 2]

显示顺序: ["A", "D", "C"]
```

### 说话人合并

`speakerMerges` 是一个扁平映射（无链式引用）：

```typescript
// 将说话人 2 合并到说话人 0
speakerMerges = { 2: 0 }

// getEffectiveSpeaker(2, merges) 返回 0
// 所有 spk=2 的片段现在显示说话人 0 的颜色
```

### 辅助函数

```typescript
// 获取合并后的有效说话人
import { getEffectiveSpeaker } from '@/stores/editorStore';

const effectiveSpk = getEffectiveSpeaker(originalSpk, speakerMerges);
const color = getSpeakerColor(effectiveSpk);
```

## 最佳实践

1. **永不修改原始数据** - 始终使用 composition 数组
2. **使用选择器** - 只订阅需要的状态切片，避免不必要的重渲染
3. **批量更新** - 使用 immer 处理复杂状态变更
4. **正确重置** - `resetEdits()` 重置 composition，`clearAll()` 清空所有数据
