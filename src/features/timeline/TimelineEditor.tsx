import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import type { EditOperationV1, TimelineClipV1 } from '@/types/project';
import {
  buildTimelineLayout,
  findLayoutItemAtTime,
  fitPixelsPerMs,
  timeToPixels,
  timelineDurationMs,
  visibleRange,
  zoomViewport,
} from './layout';
import { createSplitOperation, moveByKeyboard, trimBoundsForClip } from './plans';
import type { SourceBounds } from './types';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { TimelinePlayhead } from './TimelinePlayhead';
import { useTimelineGesture } from './useTimelineGesture';
import { useTimelinePlayback } from './useTimelinePlayback';
import {
  dispatchTimelineActiveClip,
  TIMELINE_COMMAND_EVENT,
  type TimelineCommand,
} from './events';

interface TimelineEditorProps {
  mediaRef: RefObject<HTMLMediaElement | null>;
  mediaElementKey: string;
}

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, button, a, [role="button"]'));
}

function phaseLabel(phase: 'idle' | 'previewing' | 'applying' | 'reloading'): string {
  if (phase === 'previewing') return '正在预览';
  if (phase === 'applying') return '正在提交';
  if (phase === 'reloading') return '正在同步';
  return '已同步';
}

function applyDraftToClips(
  clips: readonly TimelineClipV1[],
  draft: ReturnType<typeof useTimelineGesture>['draft']
): TimelineClipV1[] {
  if (!draft) return [...clips];
  if (draft.kind === 'move') {
    const byId = new Map(clips.map((clip) => [clip.id, clip]));
    return draft.orderedClipIds.flatMap((id) => {
      const clip = byId.get(id);
      return clip ? [clip] : [];
    });
  }
  return clips.map((clip) =>
    clip.id === draft.clipId
      ? { ...clip, source_in_ms: draft.sourceInMs, source_out_ms: draft.sourceOutMs }
      : clip
  );
}

export function TimelineEditor({ mediaRef, mediaElementKey }: TimelineEditorProps) {
  const projectId = useEditorStore((state) => state.projectId);
  const revision = useEditorStore((state) => state.revision);
  const clips = useEditorStore((state) => state.timelineClips);
  const transcriptSegments = useEditorStore((state) => state.transcriptSegments);
  const commitPhase = useEditorStore((state) => state.commitPhase);
  const isCommitting = useEditorStore((state) => state.isCommitting);
  const canUndo = useEditorStore((state) => state._undoStack.length > 0);
  const canRedo = useEditorStore((state) => state._redoStack.length > 0);
  const commitEditOperations = useEditorStore((state) => state.commitEditOperations);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fittedProjectRef = useRef<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(clips[0]?.id ?? null);
  const [pixelsPerMs, setPixelsPerMs] = useState(0.02);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  const [scrollLeftPx, setScrollLeftPx] = useState(0);

  const canonicalLayout = useMemo(() => buildTimelineLayout(clips), [clips]);
  const canonicalDurationMs = timelineDurationMs(canonicalLayout);
  const trimBounds = useMemo(() => {
    const segmentBounds = new Map<string, SourceBounds>(
      transcriptSegments.map((segment) => [
        segment.id,
        { startMs: segment.start_ms, endMs: segment.end_ms },
      ])
    );
    const result = new Map<string, SourceBounds>();
    for (const clip of clips) {
      const bounds = segmentBounds.get(clip.source_segment_id);
      if (bounds) result.set(clip.id, trimBoundsForClip(clip, clips, bounds));
    }
    return result;
  }, [clips, transcriptSegments]);

  const commitOne = useCallback(
    (operation: EditOperationV1, reason: string) => commitEditOperations([operation], reason),
    [commitEditOperations]
  );
  const gesture = useTimelineGesture({
    layout: canonicalLayout,
    pixelsPerMs,
    trackRef,
    disabled: isCommitting,
    onCommit: commitOne,
  });
  const displayClips = useMemo(() => applyDraftToClips(clips, gesture.draft), [clips, gesture.draft]);
  const displayLayout = useMemo(() => buildTimelineLayout(displayClips), [displayClips]);
  const displayDurationMs = timelineDurationMs(displayLayout);
  const playback = useTimelinePlayback({
    layout: canonicalLayout,
    mediaRef,
    mediaElementKey,
    revision,
  });

  useEffect(() => {
    const handleCommand = (event: Event) => {
      const command = (event as CustomEvent<TimelineCommand>).detail;
      if (command.type === 'stop') {
        playback.stop();
        return;
      }
      const item = canonicalLayout.find((candidate) => candidate.clipId === command.clipId);
      if (!item) return;
      const sourceSpanMs = Math.max(1, item.sourceOutMs - item.sourceInMs);
      const sourceOffsetMs = command.sourceMs === undefined
        ? 0
        : Math.max(0, Math.min(sourceSpanMs, command.sourceMs - item.sourceInMs));
      const offsetMs = item.kind === 'replacement'
        ? (sourceOffsetMs / sourceSpanMs) * item.durationMs
        : Math.min(item.durationMs, sourceOffsetMs);
      setSelectedClipId(item.clipId);
      playback.seek(item.timelineInMs + offsetMs, command.autoplay ?? true);
    };
    window.addEventListener(TIMELINE_COMMAND_EVENT, handleCommand);
    return () => window.removeEventListener(TIMELINE_COMMAND_EVENT, handleCommand);
  }, [canonicalLayout, playback.seek, playback.stop]);

  useEffect(() => {
    const item = playback.activeClipId
      ? canonicalLayout.find((candidate) => candidate.clipId === playback.activeClipId)
      : undefined;
    if (!item) {
      dispatchTimelineActiveClip(null, null);
      return;
    }
    const renderOffsetMs = Math.max(
      0,
      Math.min(item.durationMs, playback.playheadMs - item.timelineInMs)
    );
    const sourceMs = item.kind === 'replacement'
      ? item.sourceInMs + (renderOffsetMs / Math.max(1, item.durationMs)) *
        (item.sourceOutMs - item.sourceInMs)
      : item.sourceInMs + renderOffsetMs;
    dispatchTimelineActiveClip(item.clipId, sourceMs);
  }, [canonicalLayout, playback.activeClipId, playback.playheadMs]);

  useEffect(() => {
    const current = selectedClipId ? clips.some((clip) => clip.id === selectedClipId) : false;
    if (current) return;
    // A split or token delete replaces the selected clip; follow the playhead into its pieces.
    const atPlayhead = findLayoutItemAtTime(canonicalLayout, playback.playheadMs);
    setSelectedClipId(atPlayhead?.clipId ?? clips[0]?.id ?? null);
  }, [canonicalLayout, clips, playback.playheadMs, selectedClipId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidthPx(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    const next = fitPixelsPerMs(canonicalDurationMs, viewportWidthPx);
    setPixelsPerMs(next);
    setScrollLeftPx(0);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [canonicalDurationMs, viewportWidthPx]);

  useEffect(() => {
    if (!projectId || viewportWidthPx <= 0 || canonicalDurationMs <= 0) return;
    if (fittedProjectRef.current === projectId) return;
    fittedProjectRef.current = projectId;
    fit();
  }, [canonicalDurationMs, fit, projectId, viewportWidthPx]);

  const trackWidthPx = Math.max(viewportWidthPx, timeToPixels(displayDurationMs, pixelsPerMs));
  const range = visibleRange(displayLayout, {
    pixelsPerMs,
    scrollLeftPx,
    viewportWidthPx,
  });

  const seek = useCallback(
    (timelineMs: number) => {
      playback.seek(timelineMs);
      const item = findLayoutItemAtTime(canonicalLayout, Math.min(timelineMs, canonicalDurationMs - 1));
      if (item) setSelectedClipId(item.clipId);
    },
    [canonicalDurationMs, canonicalLayout, playback]
  );

  const splitOperation = useMemo(
    () => createSplitOperation(canonicalLayout, playback.playheadMs),
    [canonicalLayout, playback.playheadMs]
  );
  const splitDisabledReason = useMemo(() => {
    if (isCommitting) return '正在提交上一项编辑';
    const item = findLayoutItemAtTime(canonicalLayout, playback.playheadMs);
    if (!item) return '播放头不在可切分片段内';
    if (item.kind === 'replacement') return 'replacement 片段首版不支持切分';
    if (item.clip.token_ids.length === 0) return '该片段没有词级时间戳，无法可靠切分文本';
    return '播放头距离片段边缘不足 20ms';
  }, [canonicalLayout, isCommitting, playback.playheadMs]);

  const split = useCallback(() => {
    if (!splitOperation || isCommitting) return;
    playback.stop();
    void commitEditOperations([splitOperation], 'Timeline split at playhead').catch(() => undefined);
  }, [commitEditOperations, isCommitting, playback, splitOperation]);

  const deleteSelected = useCallback(() => {
    if (!selectedClipId || clips.length <= 1 || isCommitting) return;
    const index = clips.findIndex((clip) => clip.id === selectedClipId);
    const fallback = clips[index + 1]?.id ?? clips[index - 1]?.id ?? null;
    playback.stop();
    void commitEditOperations(
      [{ op: 'delete_clips', clip_ids: [selectedClipId] }],
      'Timeline ripple delete'
    )
      .then((result) => {
        if (result) setSelectedClipId(fallback);
      })
      .catch(() => undefined);
  }, [clips, commitEditOperations, isCommitting, playback, selectedClipId]);

  const keyboardMove = useCallback(
    (direction: -1 | 1) => {
      if (!selectedClipId || isCommitting) return;
      const result = moveByKeyboard(
        clips.map((clip) => clip.id),
        selectedClipId,
        direction
      );
      if (!result) return;
      playback.stop();
      void commitEditOperations([result.operation], 'Timeline accessible clip reorder').catch(
        () => undefined
      );
    },
    [clips, commitEditOperations, isCommitting, playback, selectedClipId]
  );

  const zoom = useCallback(
    (factor: number) => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const playheadPx = timeToPixels(playback.playheadMs, pixelsPerMs);
      const playheadVisible =
        playheadPx >= scroll.scrollLeft && playheadPx <= scroll.scrollLeft + scroll.clientWidth;
      const anchorTimelineMs = playheadVisible
        ? playback.playheadMs
        : (scroll.scrollLeft + scroll.clientWidth / 2) / pixelsPerMs;
      const next = zoomViewport(
        { pixelsPerMs, scrollLeftPx: scroll.scrollLeft, viewportWidthPx: scroll.clientWidth },
        pixelsPerMs * factor,
        anchorTimelineMs
      );
      setPixelsPerMs(next.pixelsPerMs);
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollLeft = next.scrollLeftPx;
        setScrollLeftPx(next.scrollLeftPx);
      });
    },
    [pixelsPerMs, playback.playheadMs]
  );

  useEffect(() => {
    if (!playback.isPlaying || !scrollRef.current) return;
    const scroll = scrollRef.current;
    const playheadPx = timeToPixels(playback.playheadMs, pixelsPerMs);
    const margin = Math.min(120, scroll.clientWidth * 0.2);
    if (playheadPx < scroll.scrollLeft + margin || playheadPx > scroll.scrollLeft + scroll.clientWidth - margin) {
      scroll.scrollLeft = Math.max(0, playheadPx - scroll.clientWidth / 2);
      setScrollLeftPx(scroll.scrollLeft);
    }
  }, [pixelsPerMs, playback.isPlaying, playback.playheadMs]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editableTarget(event.target) || event.repeat) return;
    // Leave Cmd/Ctrl chords (save, undo, select all...) to the browser and OS.
    if (event.metaKey || event.ctrlKey) return;
    if (event.altKey) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        keyboardMove(event.key === 'ArrowLeft' ? -1 : 1);
      }
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      playback.toggle();
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      split();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
    }
  };

  if (!projectId || clips.length === 0) return null;

  return (
    <section
      ref={containerRef}
      className="mb-5 overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] outline-none focus-visible:ring-2 focus-visible:ring-[#667eea]"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="VoxFlow 单轨时间线编辑器"
      data-testid="timeline-editor"
      data-playhead-ms={Math.round(playback.playheadMs)}
      data-gesture-kind={gesture.draft?.kind ?? 'none'}
      data-active-clip-id={playback.activeClipId ?? ''}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">时间线</h2>
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            Revision {revision} · {clips.length} clips · {phaseLabel(commitPhase)}
          </p>
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">单轨 · Ripple</div>
      </div>
      <TimelineToolbar
        playheadMs={playback.playheadMs}
        durationMs={canonicalDurationMs}
        isPlaying={playback.isPlaying}
        isBusy={isCommitting}
        canSplit={splitOperation !== null}
        splitDisabledReason={splitDisabledReason}
        canDelete={selectedClipId !== null && clips.length > 1}
        deleteDisabledReason={isCommitting
          ? '正在提交上一项编辑'
          : clips.length <= 1
            ? '时间线必须至少保留一个片段'
            : '请先选择一个片段'}
        canUndo={canUndo}
        canRedo={canRedo}
        onTogglePlayback={playback.toggle}
        onSplit={split}
        onDelete={deleteSelected}
        onUndo={() => {
          playback.stop();
          undo();
        }}
        onRedo={() => {
          playback.stop();
          redo();
        }}
        onZoomOut={() => zoom(0.75)}
        onZoomIn={() => zoom(1.35)}
        onFit={fit}
      />
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden overscroll-x-contain"
        onScroll={(event) => setScrollLeftPx(event.currentTarget.scrollLeft)}
        data-testid="timeline-scroll"
      >
        <div className="relative" style={{ width: trackWidthPx }}>
          <TimelineRuler
            durationMs={displayDurationMs}
            pixelsPerMs={pixelsPerMs}
            widthPx={trackWidthPx}
            playheadMs={playback.playheadMs}
            onSeek={seek}
          />
          <TimelineTrack
            trackRef={trackRef}
            layout={displayLayout}
            visibleStart={range.startIndex}
            visibleEnd={range.endIndex}
            pixelsPerMs={pixelsPerMs}
            widthPx={trackWidthPx}
            selectedClipId={selectedClipId}
            draft={gesture.draft}
            busy={isCommitting}
            trimBounds={trimBounds}
            onSelect={(clipId) => {
              setSelectedClipId(clipId);
              containerRef.current?.focus({ preventScroll: true });
            }}
            onBeginMove={gesture.beginMove}
            onBeginTrim={gesture.beginTrim}
            onPointerCancel={gesture.cancelGesture}
          />
          <TimelinePlayhead leftPx={timeToPixels(playback.playheadMs, pixelsPerMs)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border-color)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
        <span>拖拽片段重排</span>
        <span>拖动边缘裁切</span>
        <span>Alt + ←/→ 重排</span>
        <span>S 切分</span>
        <span>Delete 删除</span>
      </div>
    </section>
  );
}
