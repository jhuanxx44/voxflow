import type { TimelineClipV1 } from '@/types/project';

export interface TimelineLayoutItem {
  clip: TimelineClipV1;
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

export interface TimelineVisibleRange {
  startIndex: number;
  endIndex: number;
}

export interface SourceBounds {
  startMs: number;
  endMs: number;
}

export type TimelineGestureDraft =
  | {
      kind: 'move';
      clipId: string;
      anchorClipId: string;
      position: 'before' | 'after';
      orderedClipIds: string[];
    }
  | {
      kind: 'trim';
      edge: 'in' | 'out';
      clipId: string;
      sourceInMs: number;
      sourceOutMs: number;
    };

export interface TimelinePlaybackState {
  playheadMs: number;
  isPlaying: boolean;
  activeClipId: string | null;
}
