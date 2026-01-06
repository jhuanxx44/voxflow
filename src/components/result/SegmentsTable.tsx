/**
 * SegmentsTable - Displays segment information in a table format
 *
 * Shows detailed information about each segment including:
 * - Segment index
 * - Text content
 * - Start/end times
 * - Speaker ID
 * - Duration
 */

import React from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';

/**
 * Format milliseconds to MM:SS format
 */
function msToTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export const SegmentsTable: React.FC = () => {
  const { composition, lastSegments, isCharEditMode, charComposition, charLevelData } =
    useEditorStore();
  const { segmentsVisible } = useUIStore();

  if (!segmentsVisible) {
    return null;
  }

  // Get the list to display based on composition
  const activeComposition = isCharEditMode ? charComposition : composition;
  const activeData = isCharEditMode ? charLevelData : lastSegments;
  const list = activeComposition.map((idx) => activeData[idx]).filter(Boolean);

  if (!list.length) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-4">
      <h2 className="mb-4 text-lg font-semibold">
        {isCharEditMode ? '字符列表' : '段落列表'}
      </h2>

      <div className="space-y-2">
        {list.map((item, idx) => {
          const text = 'text' in item ? item.text : (item as any).char;
          const start = item.start || 0;
          const end = item.end || start;
          const duration = end - start;
          const spk = item.spk;

          return (
            <div
              key={idx}
              className="grid grid-cols-[60px_1fr_100px_100px_80px_60px] gap-2 rounded border border-[var(--border-segment)] bg-[var(--bg-segment)] p-2 text-sm"
            >
              {/* Index */}
              <div className="text-[var(--text-muted)]">#{idx}</div>

              {/* Text */}
              <div className="overflow-hidden text-ellipsis text-[var(--text-primary)]">
                {text}
              </div>

              {/* Start time */}
              <div className="text-[var(--text-secondary)]">{msToTime(start)}</div>

              {/* End time */}
              <div className="text-[var(--text-secondary)]">{msToTime(end)}</div>

              {/* Duration */}
              <div className="text-[var(--text-secondary)]">
                {(duration / 1000).toFixed(2)}s
              </div>

              {/* Speaker */}
              <div className="text-[var(--text-muted)]">
                {typeof spk === 'number' ? `SP${spk}` : '-'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
