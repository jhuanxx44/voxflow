import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SourceBounds, TimelineLayoutItem } from './types';

interface TimelineClipProps {
  item: TimelineLayoutItem;
  leftPx: number;
  widthPx: number;
  selected: boolean;
  moving: boolean;
  busy: boolean;
  bounds: SourceBounds | null;
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

export function TimelineClip(props: TimelineClipProps) {
  const { item } = props;
  const replacement = item.kind === 'replacement';
  const title = replacement
    ? `${item.clip.transcript_text} · replacement（首版不可切分或裁边）`
    : `${item.clip.transcript_text} · ${item.sourceInMs}–${item.sourceOutMs}ms`;

  return (
    <div
      className={`absolute top-2 h-16 touch-none select-none overflow-hidden rounded-md border text-left transition-[box-shadow,opacity] duration-100 ${
        replacement
          ? 'border-violet-400/70 bg-violet-500/20'
          : 'border-blue-400/60 bg-blue-500/15'
      } ${props.selected ? 'z-20 ring-2 ring-[#f97316] ring-offset-1 ring-offset-[var(--bg-input)]' : 'z-10'} ${
        props.moving ? 'opacity-80 shadow-xl' : ''
      } ${props.busy ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}
      style={{
        left: props.leftPx,
        width: Math.max(0.25, props.widthPx),
        borderWidth: props.widthPx >= 2 ? undefined : 0,
      }}
      data-testid="timeline-clip"
      data-clip-id={item.clipId}
      data-clip-kind={item.kind}
      data-source-in-ms={item.sourceInMs}
      data-source-out-ms={item.sourceOutMs}
      data-duration-ms={item.durationMs}
      title={title}
      role="option"
      tabIndex={props.selected ? 0 : -1}
      aria-selected={props.selected}
      aria-label={title}
      onPointerDown={(event) => {
        props.onSelect(item.clipId);
        props.onBeginMove(event, item.clipId);
      }}
      onPointerCancel={props.onPointerCancel}
      onFocus={() => props.onSelect(item.clipId)}
    >
      {!replacement && props.bounds ? (
        <>
          <button
            type="button"
            className="absolute inset-y-0 left-0 z-20 w-3 cursor-ew-resize border-0 bg-transparent p-0 opacity-0 focus:opacity-100"
            aria-label={`裁切 ${item.clip.transcript_text} 左边缘`}
            data-testid="timeline-trim-in"
            onPointerDown={(event) => props.onBeginTrim(event, item, 'in', props.bounds!)}
            onPointerCancel={props.onPointerCancel}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-20 w-3 cursor-ew-resize border-0 bg-transparent p-0 opacity-0 focus:opacity-100"
            aria-label={`裁切 ${item.clip.transcript_text} 右边缘`}
            data-testid="timeline-trim-out"
            onPointerDown={(event) => props.onBeginTrim(event, item, 'out', props.bounds!)}
            onPointerCancel={props.onPointerCancel}
          />
        </>
      ) : null}
      <div className="flex h-full min-w-0 flex-col justify-between px-3 py-2">
        <div className="truncate text-xs font-medium text-[var(--text-primary)]">
          {item.clip.transcript_text || '无文本片段'}
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-[var(--text-muted)]">
          <span>{(item.durationMs / 1_000).toFixed(2)}s</span>
          {replacement ? <span className="uppercase tracking-wide">TTS</span> : null}
        </div>
      </div>
    </div>
  );
}
