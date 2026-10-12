import type { EditOperationV1, TimelineClipV1 } from '@/types/project';
import type { SourceBounds, TimelineLayoutItem } from './types';
import { findLayoutItemAtTime, timelineToSourceMs } from './layout';

export const MIN_EDIT_DURATION_MS = 20;
export const DRAG_THRESHOLD_PX = 4;

export function hasExceededDragThreshold(deltaPx: number): boolean {
  return Math.abs(deltaPx) > DRAG_THRESHOLD_PX;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function projectMoveOrder(
  clipIds: readonly string[],
  clipId: string,
  anchorClipId: string,
  position: 'before' | 'after'
): string[] | null {
  if (clipId === anchorClipId || !clipIds.includes(clipId) || !clipIds.includes(anchorClipId)) {
    return null;
  }
  const next = clipIds.filter((id) => id !== clipId);
  const anchorIndex = next.indexOf(anchorClipId);
  next.splice(position === 'before' ? anchorIndex : anchorIndex + 1, 0, clipId);
  return sameOrder(clipIds, next) ? null : next;
}

export function createMoveOperation(
  clipIds: readonly string[],
  clipId: string,
  anchorClipId: string,
  position: 'before' | 'after'
): { operation: EditOperationV1; orderedClipIds: string[] } | null {
  const orderedClipIds = projectMoveOrder(clipIds, clipId, anchorClipId, position);
  if (!orderedClipIds) return null;
  return {
    operation: { op: 'move_clip', clip_id: clipId, anchor_clip_id: anchorClipId, position },
    orderedClipIds,
  };
}

export function createMoveOperationAtTimeline(
  layout: readonly TimelineLayoutItem[],
  clipId: string,
  timelineMs: number
): { operation: EditOperationV1; orderedClipIds: string[] } | null {
  const remaining = layout.filter((item) => item.clipId !== clipId);
  if (remaining.length === layout.length || remaining.length === 0) return null;
  let cursorMs = 0;
  let insertionIndex = remaining.length;
  for (let index = 0; index < remaining.length; index += 1) {
    if (timelineMs < cursorMs + remaining[index].durationMs / 2) {
      insertionIndex = index;
      break;
    }
    cursorMs += remaining[index].durationMs;
  }
  const anchor = insertionIndex < remaining.length
    ? remaining[insertionIndex]
    : remaining[remaining.length - 1];
  return createMoveOperation(
    layout.map((item) => item.clipId),
    clipId,
    anchor.clipId,
    insertionIndex < remaining.length ? 'before' : 'after'
  );
}

export function createSplitOperation(
  layout: readonly TimelineLayoutItem[],
  playheadMs: number,
  minimumDurationMs = MIN_EDIT_DURATION_MS
): EditOperationV1 | null {
  const item = findLayoutItemAtTime(layout, playheadMs);
  if (!item || item.kind !== 'source' || item.clip.token_ids.length === 0) return null;
  const atMs = Math.round(timelineToSourceMs(item, playheadMs));
  if (
    atMs - item.sourceInMs < minimumDurationMs ||
    item.sourceOutMs - atMs < minimumDurationMs
  ) {
    return null;
  }
  return { op: 'split_clip', clip_id: item.clipId, at_ms: atMs };
}

/**
 * Mirrors the domain trim rule: a clip may grow back into source time of its segment that no
 * other clip from the same segment covers, but never into a sibling's range.
 */
export function trimBoundsForClip(
  clip: TimelineClipV1,
  clips: readonly TimelineClipV1[],
  segmentBounds: SourceBounds
): SourceBounds {
  let startMs = segmentBounds.startMs;
  let endMs = segmentBounds.endMs;
  for (const sibling of clips) {
    if (sibling.id === clip.id || sibling.source_segment_id !== clip.source_segment_id) continue;
    if (sibling.source_in_ms < clip.source_in_ms) {
      startMs = Math.max(startMs, Math.min(clip.source_in_ms, sibling.source_out_ms));
    }
    if (sibling.source_out_ms > clip.source_out_ms) {
      endMs = Math.min(endMs, Math.max(clip.source_out_ms, sibling.source_in_ms));
    }
  }
  return { startMs, endMs };
}

export function createTrimOperation(options: {
  item: TimelineLayoutItem;
  edge: 'in' | 'out';
  requestedSourceMs: number;
  bounds: SourceBounds;
  minimumDurationMs?: number;
}): EditOperationV1 | null {
  const { item, edge, bounds } = options;
  if (item.kind !== 'source') return null;
  const minimumDurationMs = options.minimumDurationMs ?? MIN_EDIT_DURATION_MS;
  let sourceInMs = item.sourceInMs;
  let sourceOutMs = item.sourceOutMs;
  if (edge === 'in') {
    sourceInMs = Math.max(
      bounds.startMs,
      Math.min(Math.round(options.requestedSourceMs), sourceOutMs - minimumDurationMs)
    );
  } else {
    sourceOutMs = Math.min(
      bounds.endMs,
      Math.max(Math.round(options.requestedSourceMs), sourceInMs + minimumDurationMs)
    );
  }
  if (sourceInMs === item.sourceInMs && sourceOutMs === item.sourceOutMs) return null;
  return {
    op: 'trim_clip',
    clip_id: item.clipId,
    source_in_ms: sourceInMs,
    source_out_ms: sourceOutMs,
  };
}

export function moveByKeyboard(
  clipIds: readonly string[],
  clipId: string,
  direction: -1 | 1
): { operation: EditOperationV1; orderedClipIds: string[] } | null {
  const index = clipIds.indexOf(clipId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= clipIds.length) return null;
  return createMoveOperation(
    clipIds,
    clipId,
    clipIds[targetIndex],
    direction < 0 ? 'before' : 'after'
  );
}
