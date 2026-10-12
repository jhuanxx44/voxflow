export const TIMELINE_COMMAND_EVENT = 'voxflow:timeline-command';
export const TIMELINE_ACTIVE_CLIP_EVENT = 'voxflow:timeline-active-clip';
export const TIMELINE_MEDIA_PAUSE_EVENT = 'voxflow:timeline-media-pause';

export type TimelineCommand =
  | { type: 'seek-clip'; clipId: string; sourceMs?: number; autoplay?: boolean }
  | { type: 'stop' };

export function dispatchTimelineCommand(command: TimelineCommand): void {
  window.dispatchEvent(new CustomEvent<TimelineCommand>(TIMELINE_COMMAND_EVENT, { detail: command }));
}

export interface TimelineActiveClipDetail {
  clipId: string | null;
  sourceMs: number | null;
}

export function dispatchTimelineActiveClip(clipId: string | null, sourceMs: number | null): void {
  window.dispatchEvent(
    new CustomEvent<TimelineActiveClipDetail>(TIMELINE_ACTIVE_CLIP_EVENT, {
      detail: { clipId, sourceMs },
    })
  );
}
