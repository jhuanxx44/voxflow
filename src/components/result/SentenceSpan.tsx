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
 * - Inline editing with TTS regeneration
 * - TTS audio indicators (regenerated / generating)
 */

import React, { useRef, useState, useEffect } from 'react';
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
  onSeek: (time: number, renderIndex: number, originalIndex?: number) => void;
  /** Callback for drag start */
  onDragStart: (index: number) => void;
  /** Callback for drag over */
  onDragOver: (e: React.DragEvent) => void;
  /** Callback for drag leave */
  onDragLeave: () => void;
  /** Callback for drop */
  onDrop: (index: number) => void;
  /** Keyboard-accessible segment reorder callback */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Callback for right-click context menu */
  onContextMenu: (e: React.MouseEvent, index: number, originalIndex?: number) => void;

  // TTS inline editing props
  /** Whether this span is in inline editing mode */
  isInlineEditing?: boolean;
  /** Callback when inline edit is confirmed */
  onInlineEditConfirm?: (newText: string, originalIndex: number) => void;
  /** Callback when inline edit is cancelled */
  onInlineEditCancel?: () => void;
  /** Whether this segment has TTS audio */
  hasTTSAudio?: boolean;
  /** Whether TTS is currently generating for this segment */
  isTTSGenerating?: boolean;
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
  onReorder,
  onContextMenu,
  isInlineEditing = false,
  onInlineEditConfirm,
  onInlineEditCancel,
  hasTTSAudio = false,
  isTTSGenerating = false,
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [editText, setEditText] = useState('');
  const speakerMerges = useEditorStore((state) => state.speakerMerges);

  // Get text content
  const text = 'text' in data ? data.text : (data as CharUnit).char;
  const start = data.start || 0;
  const end = data.end || start;
  const spk = data.spk;

  // Initialize edit text when entering inline edit mode
  useEffect(() => {
    if (isInlineEditing) {
      setEditText(text);
      // Focus textarea on next tick
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isInlineEditing, text]);

  // Calculate speaker color (use effective speaker after merges)
  const effectiveSpk = typeof spk === 'number' ? getEffectiveSpeaker(spk, speakerMerges) : undefined;
  const speakerColor = typeof effectiveSpk === 'number' ? getSpeakerColor(effectiveSpk) : undefined;

  // Handle click to seek
  const handleClick = () => {
    if (isInlineEditing) return;
    onSeek(start / 1000, renderIndex, originalIndex);
  };

  // Handle drag start
  const handleDragStart = (_e: React.DragEvent) => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onReorder || !('text' in data) || !e.altKey) return;
    if (e.key === 'ArrowLeft' && renderIndex > 0) {
      e.preventDefault();
      onReorder(renderIndex, renderIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onReorder(renderIndex, renderIndex + 1);
    }
  };

  // Handle context menu — pass originalIndex
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, renderIndex, originalIndex);
  };

  // Handle inline edit keydown
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onInlineEditConfirm?.(editText, originalIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onInlineEditCancel?.();
    }
  };

  // Inline editing mode
  if (isInlineEditing) {
    return (
      <div className="inline-edit-container my-1 rounded border border-blue-500/50 bg-[var(--bg-input)] p-2">
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="w-full bg-transparent text-[var(--text-primary)] text-sm resize-none outline-none min-h-[2.5rem]"
          rows={2}
        />
        <div className="flex gap-2 mt-1.5">
          <button
            onClick={() => onInlineEditConfirm?.(editText, originalIndex)}
            className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            确认并重生成
          </button>
          <button
            onClick={() => onInlineEditCancel?.()}
            className="px-3 py-1 text-xs rounded bg-[var(--bg-button)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  // Build class names
  const classNames = [
    'sentence',
    isActive && 'active',
    isDeleted && 'deleted',
    (isDraggedOver || showInsertAfter) && 'insert-after',
    hasTTSAudio && 'tts-regenerated',
    isTTSGenerating && 'tts-generating',
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
      tabIndex={isDeleted ? -1 : 0}
      aria-label={`${text}，Alt 加方向键调整顺序`}
      data-start={start}
      data-end={end}
      data-idx={originalIndex}
      data-comp-index={renderIndex}
      data-spk={typeof spk === 'number' ? spk : undefined}
      data-testid={'char' in data ? `token-${renderIndex}` : `segment-${renderIndex}`}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      {text}
    </span>
  );
};
