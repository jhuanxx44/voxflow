/**
 * SentenceSpan - Individual sentence span component
 *
 * Features:
 * - Click to seek audio playback
 * - Active state when highlighted during playback
 * - Deleted state (strikethrough, opacity)
 * - Drag-and-drop support for reordering
 * - Insert position indicator
 * - Speaker highlighting with color
 * - Right-click context menu integration
 */

import React, { useRef, useState } from 'react';
import type { Segment, CharUnit } from '@/types';
import { useEditorStore, getEffectiveSpeaker } from '@/stores/editorStore';
import { getSpeakerColor } from '@/utils/constants';

interface SentenceSpanProps {
  /** The segment or character data to display */
  data: Segment | CharUnit;
  /** Position in the composition array */
  renderIndex: number;
  /** Original index in segments/charLevelData array */
  originalIndex: number;
  /** Whether this span is currently highlighted */
  isActive: boolean;
  /** Whether this span is deleted (hidden/strikethrough) */
  isDeleted?: boolean;
  /** Whether to show insert-after indicator */
  showInsertAfter?: boolean;
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

export const SentenceSpan: React.FC<SentenceSpanProps> = ({
  data,
  renderIndex,
  originalIndex,
  isActive,
  isDeleted = false,
  showInsertAfter = false,
  onSeek,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const speakerMerges = useEditorStore((state) => state.speakerMerges);

  // Get text content
  const text = 'text' in data ? data.text : (data as CharUnit).char;
  const start = data.start || 0;
  const end = data.end || start;
  const spk = data.spk;

  // Calculate speaker color (use effective speaker after merges)
  const effectiveSpk = typeof spk === 'number' ? getEffectiveSpeaker(spk, speakerMerges) : undefined;
  const speakerColor = typeof effectiveSpk === 'number' ? getSpeakerColor(effectiveSpk) : undefined;

  // Handle click to seek
  const handleClick = () => {
    onSeek(start / 1000, renderIndex);
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent) => {
    onDragStart(renderIndex);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggedOver(true);
    onDragOver(e);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setIsDraggedOver(false);
    onDragLeave();
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggedOver(false);
    onDrop(renderIndex);
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, renderIndex);
  };

  // Build class names
  const classNames = [
    'sentence',
    isActive && 'active',
    isDeleted && 'deleted',
    (isDraggedOver || showInsertAfter) && 'insert-after',
  ]
    .filter(Boolean)
    .join(' ');

  // Custom CSS variable for speaker highlight color
  const style = speakerColor ? { '--hl': speakerColor } as React.CSSProperties : undefined;

  return (
    <span
      ref={spanRef}
      className={classNames}
      style={style}
      draggable={!isDeleted}
      data-start={start}
      data-end={end}
      data-idx={originalIndex}
      data-comp-index={renderIndex}
      data-spk={typeof spk === 'number' ? spk : undefined}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      {text}
    </span>
  );
};
