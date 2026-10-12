import { useMemo } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { chooseRulerStepMs, pixelsToTime, timeToPixels } from './layout';

interface TimelineRulerProps {
  durationMs: number;
  pixelsPerMs: number;
  widthPx: number;
  playheadMs: number;
  onSeek: (timelineMs: number) => void;
}

function labelTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function TimelineRuler({ durationMs, pixelsPerMs, widthPx, playheadMs, onSeek }: TimelineRulerProps) {
  const ticks = useMemo(() => {
    const stepMs = chooseRulerStepMs(pixelsPerMs);
    const result: number[] = [];
    for (let value = 0; value <= durationMs; value += stepMs) result.push(value);
    return result;
  }, [durationMs, pixelsPerMs]);

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(durationMs, pixelsToTime(event.clientX - rect.left, pixelsPerMs))));
  };

  const seekFromKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') onSeek(0);
    else if (event.key === 'End') onSeek(durationMs);
    else onSeek(Math.max(0, Math.min(durationMs, playheadMs + (event.key === 'ArrowLeft' ? -1_000 : 1_000))));
  };

  return (
    <div
      className="relative h-7 cursor-col-resize select-none border-b border-[var(--border-color)] bg-[var(--bg-input)]"
      style={{ width: widthPx }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      data-testid="timeline-ruler"
      aria-label="时间尺，拖动可定位播放头"
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs)}
      aria-valuenow={Math.round(playheadMs)}
      aria-valuetext={labelTime(playheadMs)}
      onKeyDown={seekFromKeyboard}
    >
      {ticks.map((tick) => (
        <div
          key={tick}
          className="absolute inset-y-0 border-l border-[var(--border-input)]"
          style={{ left: timeToPixels(tick, pixelsPerMs) }}
        >
          <span className="absolute left-1 top-1 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
            {labelTime(tick)}
          </span>
        </div>
      ))}
    </div>
  );
}
