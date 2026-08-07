/**
 * useDragAndDrop hook - Handles drag and drop for sentence reordering
 *
 * This hook manages the drag and drop state for reordering segments/characters.
 * It uses the editorStore's dragSrcIdx to track the source position.
 *
 * The drag and drop flow:
 * 1. dragstart - Record the source index
 * 2. dragover - Show visual feedback (insert-after indicator)
 * 3. drop - Perform the reorder operation
 * 4. dragleave - Remove visual feedback
 */

import { useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';

interface UseDragAndDropOptions {
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function useDragAndDrop({ onReorder }: UseDragAndDropOptions) {
  const { dragSrcIdx, setDragSrcIdx, editedPlaying } = useEditorStore();

  /**
   * Handle drag start - record source index
   */
  const handleDragStart = useCallback(
    (index: number) => {
      setDragSrcIdx(index);
    },
    [setDragSrcIdx]
  );

  /**
   * Handle drag over - allow drop and show visual feedback
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Visual feedback is handled by CSS classes in the component
  }, []);

  /**
   * Handle drag leave - remove visual feedback
   */
  const handleDragLeave = useCallback(() => {
    // Visual feedback cleanup is handled in the component
  }, []);

  /**
   * Handle drop - perform the reorder
   */
  const handleDrop = useCallback(
    (toIndex: number, stopEditedPlayback?: () => void) => {
      if (dragSrcIdx === null || dragSrcIdx === toIndex) {
        setDragSrcIdx(null);
        return;
      }

      // Stop playback during reordering to avoid index confusion
      if (editedPlaying && stopEditedPlayback) {
        stopEditedPlayback();
      }

      onReorder(dragSrcIdx, toIndex);

      // Clear drag source
      setDragSrcIdx(null);
    },
    [dragSrcIdx, editedPlaying, setDragSrcIdx, onReorder]
  );

  return {
    dragSrcIdx,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
