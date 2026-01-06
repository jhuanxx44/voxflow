/**
 * ParagraphGroup - Smart paragraph grouping container
 *
 * Groups multiple sentence spans into a paragraph for smart-paragraph display mode.
 * The grouping is based on:
 * - Pause duration between segments (PAUSE_THRESHOLD = 5000ms)
 * - Speaker changes
 * - Paragraph length constraints
 */

import React from 'react';
import { SentenceSpan } from './SentenceSpan';
import type { Segment, CharUnit } from '@/types';

interface ParagraphGroupProps {
  /** Segments in this paragraph */
  segments: (Segment | CharUnit)[];
  /** Render indices for each segment in the composition array */
  renderIndices: number[];
  /** Original indices in the segments/charLevelData array */
  originalIndices: number[];
  /** Currently active (highlighted) index */
  activeIndex: number | null;
  /** Callback when span is clicked (seek audio) */
  onSeek: (time: number, renderIndex: number) => void;
  /** Callback for drag start */
  onDragStart: (index: number) => void;
  /** Callback for drag over */
  onDragOver: (e: React.DragEvent) => void;
  /** Callback for drag leave */
  onDragLeave: () => void;
  /** Callback for drop */
  onDrop: (index: number) => void;
  /** Callback for right-click context menu */
  onContextMenu: (e: React.MouseEvent, index: number) => void;
}

export const ParagraphGroup: React.FC<ParagraphGroupProps> = ({
  segments,
  renderIndices,
  originalIndices,
  activeIndex,
  onSeek,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
}) => {
  return (
    <div className="paragraph">
      {segments.map((segment, index) => (
        <SentenceSpan
          key={`${renderIndices[index]}-${originalIndices[index]}`}
          data={segment}
          renderIndex={renderIndices[index]}
          originalIndex={originalIndices[index]}
          isActive={renderIndices[index] === activeIndex}
          onSeek={onSeek}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
};
