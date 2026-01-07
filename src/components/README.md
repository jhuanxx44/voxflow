# React 组件文档

本目录包含 FunASR 音频编辑器的所有 React + TypeScript + Tailwind CSS 组件。

## 组件结构

```
components/
├── layout/              # 布局组件
│   ├── MainLayout.tsx   # 双栏主布局（内容 + 聊天面板）
│   ├── Header.tsx       # 顶部标题栏，含主题切换
│   ├── Card.tsx         # 可复用卡片容器，支持折叠
│   └── index.ts
├── common/              # 通用 UI 组件
│   ├── Button.tsx       # 按钮组件，支持多种样式
│   ├── Modal.tsx        # 模态对话框
│   ├── ContextMenu.tsx  # 右键菜单
│   ├── LoadingSpinner.tsx # 彩虹加载动画
│   └── index.ts
├── audio/               # 音频相关组件
│   ├── AudioPlayer.tsx  # 音频播放器（旧版）
│   ├── FileSelector.tsx # 文件上传，支持拖拽，支持音频/视频
│   ├── RecognitionSettings.tsx # ASR 设置（模式、热词、缓存）
│   └── index.ts
├── media/               # 媒体播放组件
│   ├── MediaPlayer.tsx  # 统一媒体播放器（音频/视频）
│   └── index.ts
├── chat/                # LLM 聊天面板组件
│   ├── ChatPanel.tsx    # 聊天主容器，含消息历史
│   ├── ChatInput.tsx    # 输入区域，含快捷命令
│   ├── ChatMessage.tsx  # 消息气泡，支持 Markdown
│   ├── FillerAnalysis.tsx # 口癖分析 UI，含复选框批量删除
│   ├── PolishAnalysis.tsx # 润色建议 UI，含应用按钮
│   └── index.ts
├── modals/              # 弹窗组件
│   ├── MaterialsModal.tsx # 素材库浏览器
│   ├── AdminModal.tsx   # 管理面板（上传/删除素材）
│   └── index.ts
└── result/              # 识别结果组件
    ├── ResultCard.tsx   # 结果主显示区，含工具栏和说话人统计
    ├── SentenceSpan.tsx # 单个句子/字符 span，支持拖拽
    ├── ParagraphGroup.tsx # 智能分段容器
    ├── SegmentsTable.tsx # 分段详情表格视图
    ├── DebugInfo.tsx    # 调试信息显示
    └── index.ts
```

## 核心组件

### MediaPlayer

统一的媒体播放器，同时支持音频和视频文件。

```tsx
import { MediaPlayer, MediaPlayerWithRef } from '@/components/media';
import { useRef } from 'react';

// 基础用法
<MediaPlayer src="/path/to/file" />

// 使用 ref 进行编程控制
const mediaRef = useRef<HTMLMediaElement>(null);
<MediaPlayerWithRef ref={mediaRef} />
```

### ResultCard

识别结果主显示组件，包含说话人统计、显示模式切换和编辑工具。

功能特性：
- 说话人数量统计，带颜色标签
- 右键点击说话人标签可编辑名称或合并说话人
- 显示模式：连续、逐行、智能分段
- 编辑模式：段落级或逐字级
- 口癖搜索删除
- 拖拽排序

```tsx
import { ResultCard } from '@/components/result';

<ResultCard audioRef={audioRef} />
```

### ChatPanel

LLM 聊天助手面板，支持流式响应。

功能特性：
- 快捷命令气泡（概括、删除口癖、润色）
- 响应内容支持 Markdown 渲染
- 口癖分析带复选框，支持批量删除
- 润色建议带应用按钮，一键修正
- 自动滚动到最新消息

```tsx
import { ChatPanel } from '@/components/chat';

<ChatPanel />
```

### FileSelector

文件上传组件，支持拖拽上传音频和视频文件。

```tsx
import { FileSelector } from '@/components/audio';

<FileSelector />
```

支持的格式：
- 音频：mp3, wav, flac, m4a, ogg, aac, wma
- 视频：mp4, mkv, avi, mov, wmv, flv, webm, m4v, 3gp

### RecognitionSettings

ASR 识别设置面板。

```tsx
import { RecognitionSettings } from '@/components/audio';

<RecognitionSettings onRecognize={handleRecognize} />
```

设置项：
- 识别模式（基础/高级）
- 热词配置
- 缓存开关
- 开始识别按钮

## 状态管理

组件使用 Zustand stores 进行状态管理：

### asrStore
- `currentFile`, `currentMaterial`, `audioUrl`, `mediaType`
- `recognitionMode`, `hotwords`, `isRecognizing`
- `serverStatus`, `cacheEnabled`

### editorStore
- `lastSegments`, `charLevelData`, `composition`, `charComposition`
- `speakerNames`, `speakerMerges`（说话人编辑/合并）
- `displayMode`, `isCharEditMode`, `hasEdited`
- Actions: `deleteByText`, `replaceText`, `mergeSpeaker` 等

### uiStore
- `theme`, `contextMenu` 状态
- `showContextMenu`, `hideContextMenu` actions

## 主题系统

所有组件使用 `/src/index.css` 中定义的 CSS 变量：

**深色主题（默认）：**
- `--bg-body`: #0f1216
- `--bg-card`: #171a21
- `--bg-button`: #1e2430
- `--text-primary`: #e6e6e6
- `--highlight-color`: #2a5a9c

**浅色主题：**
- 通过给 `<html>` 添加 `.light` class 激活
- 覆盖所有 CSS 变量为浅色主题颜色

## 说话人颜色

说话人高亮使用 `@/utils/constants` 中预定义的颜色：

```tsx
import { getSpeakerColor } from '@/utils/constants';

// 根据说话人 ID（从 0 开始）返回颜色
const color = getSpeakerColor(0); // "#4CAF50" (绿色)
const color = getSpeakerColor(1); // "#2196F3" (蓝色)
// ... 共 8 种颜色循环使用
```

## 样式规范

- 使用 Tailwind 工具类处理布局和间距
- 使用 CSS 变量设置颜色：`bg-[var(--bg-card)]`
- 过渡动画：`transition-all duration-300`
- 圆角：`rounded-lg` (12px) 或 `rounded-xl` (16px)
- 间距：`gap-2`, `gap-4`, `p-4`, `mb-4`
