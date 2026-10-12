import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { timeToPixels } from './layout';
import type { SourceBounds, TimelineGestureDraft, TimelineLayoutItem } from './types';
import { TimelineClip } from './TimelineClip';

interface TimelineTrackProps {
  trackRef: RefObject<HTMLDivElement | null>;
  layout: readonly TimelineLayoutItem[];
  visibleStart: number;
  visibleEnd: number;
  pixelsPerMs: number;
  widthPx: number;
  selectedClipId: string | null;
  draft: TimelineGestureDraft | null;
  busy: boolean;
  /** Allowed trim range per clip ID, from canonical (not draft) clips. */
  trimBounds: ReadonlyMap<string, SourceBounds>;
  onSelect: (clipId: string) => void;
  onBeginMove: (event: ReactPointerEvent<HTMLElement>, clipId: string) => void;
  onBeginTrim: (
    event: ReactPointerEvent<HTMLElement>,
    item: TimelineLayoutItem,
    edge: 'in' | 'out',
    bounds: SourceBounds
  ) => void;
  onPointerCancel: () => void;
}

export function TimelineTrack(props: TimelineTrackProps) {
  return (
    <div
      ref={props.trackRef}
      className="relative h-20 bg-[var(--bg-input)]"
      style={{ width: props.widthPx }}
      role="listbox"
      aria-label="单轨时间线"
      data-testid="timeline-track"
    >
      {props.layout.slice(props.visibleStart, props.visibleEnd).map((item) => (
        <TimelineClip
          key={item.clipId}
          item={item}
          leftPx={timeToPixels(item.timelineInMs, props.pixelsPerMs)}
          widthPx={timeToPixels(item.durationMs, props.pixelsPerMs)}
          selected={item.clipId === props.selectedClipId}
          moving={props.draft?.kind === 'move' && props.draft.clipId === item.clipId}
          busy={props.busy}
          bounds={props.trimBounds.get(item.clipId) ?? null}
          onSelect={props.onSelect}
          onBeginMove={props.onBeginMove}
          onBeginTrim={props.onBeginTrim}
          onPointerCancel={props.onPointerCancel}
        />
      ))}
    </div>
  );
}
