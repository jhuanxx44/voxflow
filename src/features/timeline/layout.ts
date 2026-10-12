import type { TimelineClipV1 } from '@/types/project';
import type {
  TimelineLayoutItem,
  TimelineViewport,
  TimelineVisibleRange,
} from './types';

export const MIN_PIXELS_PER_MS = 0.002;
export const MAX_PIXELS_PER_MS = 0.5;

export function clipDurationMs(clip: TimelineClipV1): number {
  return clip.render_duration_ms ?? clip.source_out_ms - clip.source_in_ms;
}

export function buildTimelineLayout(clips: readonly TimelineClipV1[]): TimelineLayoutItem[] {
  let timelineMs = 0;
  return clips.map((clip, clipIndex) => {
    const durationMs = clipDurationMs(clip);
    const item: TimelineLayoutItem = {
      clip,
      clipId: clip.id,
      clipIndex,
      timelineInMs: timelineMs,
      timelineOutMs: timelineMs + durationMs,
      sourceInMs: clip.source_in_ms,
      sourceOutMs: clip.source_out_ms,
      durationMs,
      kind: clip.kind,
    };
    timelineMs += durationMs;
    return item;
  });
}

export function timelineDurationMs(layout: readonly TimelineLayoutItem[]): number {
  return layout.at(-1)?.timelineOutMs ?? 0;
}

export function findLayoutItemAtTime(
  layout: readonly TimelineLayoutItem[],
  timelineMs: number
): TimelineLayoutItem | null {
  if (layout.length === 0 || timelineMs < 0 || timelineMs >= timelineDurationMs(layout)) {
    return null;
  }
  let low = 0;
  let high = layout.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const item = layout[middle];
    if (timelineMs < item.timelineInMs) {
      high = middle - 1;
    } else if (timelineMs >= item.timelineOutMs) {
      low = middle + 1;
    } else {
      return item;
    }
  }
  return null;
}

export function timelineToSourceMs(item: TimelineLayoutItem, timelineMs: number): number {
  const offset = Math.max(0, Math.min(item.durationMs, timelineMs - item.timelineInMs));
  if (item.kind === 'replacement') return offset;
  return item.sourceInMs + offset;
}

export function sourceToTimelineMs(item: TimelineLayoutItem, sourceMs: number): number {
  if (item.kind === 'replacement') {
    return item.timelineInMs + Math.max(0, Math.min(item.durationMs, sourceMs));
  }
  return (
    item.timelineInMs +
    Math.max(0, Math.min(item.durationMs, sourceMs - item.sourceInMs))
  );
}

export function timeToPixels(timeMs: number, pixelsPerMs: number): number {
  return timeMs * pixelsPerMs;
}

export function pixelsToTime(pixels: number, pixelsPerMs: number): number {
  return pixelsPerMs > 0 ? pixels / pixelsPerMs : 0;
}

export function clampPixelsPerMs(value: number): number {
  return Math.max(MIN_PIXELS_PER_MS, Math.min(MAX_PIXELS_PER_MS, value));
}

export function fitPixelsPerMs(durationMs: number, viewportWidthPx: number): number {
  if (durationMs <= 0 || viewportWidthPx <= 0) return MIN_PIXELS_PER_MS;
  return Math.min(MAX_PIXELS_PER_MS, viewportWidthPx / durationMs);
}

export function zoomViewport(
  viewport: TimelineViewport,
  nextPixelsPerMs: number,
  anchorTimelineMs: number
): TimelineViewport {
  const pixelsPerMs = clampPixelsPerMs(nextPixelsPerMs);
  const anchorViewportPx = anchorTimelineMs * viewport.pixelsPerMs - viewport.scrollLeftPx;
  return {
    ...viewport,
    pixelsPerMs,
    scrollLeftPx: Math.max(0, anchorTimelineMs * pixelsPerMs - anchorViewportPx),
  };
}

export function visibleRange(
  layout: readonly TimelineLayoutItem[],
  viewport: TimelineViewport,
  overscanPx = 200
): TimelineVisibleRange {
  if (layout.length === 0) return { startIndex: 0, endIndex: 0 };
  const startMs = Math.max(0, pixelsToTime(viewport.scrollLeftPx - overscanPx, viewport.pixelsPerMs));
  const endMs = pixelsToTime(
    viewport.scrollLeftPx + viewport.viewportWidthPx + overscanPx,
    viewport.pixelsPerMs
  );

  let low = 0;
  let high = layout.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (layout[middle].timelineOutMs <= startMs) low = middle + 1;
    else high = middle;
  }
  const startIndex = low;

  low = startIndex;
  high = layout.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (layout[middle].timelineInMs < endMs) low = middle + 1;
    else high = middle;
  }
  return { startIndex, endIndex: low };
}

export function chooseRulerStepMs(pixelsPerMs: number): number {
  const candidates = [100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
  return candidates.find((candidate) => candidate * pixelsPerMs >= 72) ?? 120_000;
}
