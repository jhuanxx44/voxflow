/**
 * useComposition hook - Manages the composition array for non-destructive editing
 *
 * This hook doesn't maintain its own state - it works with the editorStore
 * and provides utility functions for composition management.
 *
 * The composition array is a critical part of the editor:
 * - composition[]: indices into original segments array
 * - charComposition[]: indices into charLevelData array
 * - When user deletes/reorders, we only modify these index arrays
 * - Original data (lastSegments, charLevelData) is never modified
 */

import { useEditorStore } from '@/stores/editorStore';
import { useCallback } from 'react';

export function useComposition() {
  const {
    composition,
    charComposition,
    deleteAtPosition,
    deleteCharAtPosition,
    reorderComposition,
    updateComposition,
    updateCharComposition,
    isCharEditMode,
    displayMode,
    smartParagraphGroups,
    setSmartParagraphGroups,
    setSmartParagraphManuallyEdited,
  } = useEditorStore();

  /**
   * Delete a segment at the given position in the composition array
   * This marks the segment as deleted by removing it from composition
   */
  const handleDeleteAtPosition = useCallback(
    (index: number) => {
      if (isCharEditMode) {
        deleteCharAtPosition(index);
      } else {
        deleteAtPosition(index);
      }
    },
    [isCharEditMode, deleteAtPosition, deleteCharAtPosition]
  );

  /**
   * Reorder composition by moving a segment from one position to another
   * Also updates smart paragraph groups if in smart-paragraph mode
   */
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;

      reorderComposition(fromIndex, toIndex);

      // If in smart paragraph mode, update the groups
      if (displayMode === 'smart-paragraph' && smartParagraphGroups.length > 0) {
        setSmartParagraphManuallyEdited(true);

        // Update paragraph groups to reflect the reordering
        const newGroups = smartParagraphGroups.map((group) => group.slice());

        // Find source and destination group indices
        let srcGroupIdx = -1,
          srcPosInGroup = -1;
        for (let i = 0; i < newGroups.length; i++) {
          const idx = newGroups[i].indexOf(fromIndex);
          if (idx !== -1) {
            srcGroupIdx = i;
            srcPosInGroup = idx;
            break;
          }
        }

        let dstGroupIdx = -1,
          dstPosInGroup = -1;
        for (let i = 0; i < newGroups.length; i++) {
          const idx = newGroups[i].indexOf(toIndex);
          if (idx !== -1) {
            dstGroupIdx = i;
            dstPosInGroup = idx;
            break;
          }
        }

        if (srcGroupIdx !== -1 && dstGroupIdx !== -1) {
          if (srcGroupIdx === dstGroupIdx) {
            // Same paragraph - reorder within group
            const group = newGroups[srcGroupIdx];
            const [moved] = group.splice(srcPosInGroup, 1);
            const insertPos = srcPosInGroup < dstPosInGroup ? dstPosInGroup : dstPosInGroup + 1;
            group.splice(insertPos, 0, moved);
          } else {
            // Different paragraphs - move between groups
            const [moved] = newGroups[srcGroupIdx].splice(srcPosInGroup, 1);
            newGroups[dstGroupIdx].splice(dstPosInGroup + 1, 0, moved);

            // Remove empty groups
            const filteredGroups = newGroups.filter((g) => g.length > 0);
            setSmartParagraphGroups(filteredGroups);
            return;
          }
        }

        setSmartParagraphGroups(newGroups);
      }
    },
    [
      reorderComposition,
      displayMode,
      smartParagraphGroups,
      setSmartParagraphGroups,
      setSmartParagraphManuallyEdited,
    ]
  );

  /**
   * Delete multiple positions (used for filler word removal)
   * Deletes from back to front to avoid index shifting issues
   */
  const handleBulkDelete = useCallback(
    (indices: number[]) => {
      // Sort indices in descending order to delete from back to front
      const sortedIndices = [...indices].sort((a, b) => b - a);

      if (isCharEditMode) {
        let newCharComposition = [...charComposition];
        sortedIndices.forEach((idx) => {
          newCharComposition = newCharComposition.filter((_, i) => i !== idx);
        });
        updateCharComposition(newCharComposition);
      } else {
        let newComposition = [...composition];

        // For smart paragraph mode, we need to update groups
        if (displayMode === 'smart-paragraph') {
          setSmartParagraphManuallyEdited(true);

          let newGroups = smartParagraphGroups.map((group) => group.slice());

          // Delete each index and update groups
          sortedIndices.forEach((pos) => {
            // Remove from composition
            newComposition = newComposition.filter((_, i) => i !== pos);

            // Remove from paragraph groups
            for (let g = 0; g < newGroups.length; g++) {
              const idx = newGroups[g].indexOf(pos);
              if (idx !== -1) {
                newGroups[g].splice(idx, 1);
                break;
              }
            }

            // Update all indices after this position (shift down)
            for (let g = 0; g < newGroups.length; g++) {
              for (let j = 0; j < newGroups[g].length; j++) {
                if (newGroups[g][j] > pos) {
                  newGroups[g][j]--;
                }
              }
            }
          });

          // Remove empty groups
          newGroups = newGroups.filter((group) => group.length > 0);
          setSmartParagraphGroups(newGroups);
        } else {
          sortedIndices.forEach((idx) => {
            newComposition = newComposition.filter((_, i) => i !== idx);
          });
        }

        updateComposition(newComposition);
      }
    },
    [
      isCharEditMode,
      composition,
      charComposition,
      updateComposition,
      updateCharComposition,
      displayMode,
      smartParagraphGroups,
      setSmartParagraphGroups,
      setSmartParagraphManuallyEdited,
    ]
  );

  return {
    composition,
    charComposition,
    deleteAtPosition: handleDeleteAtPosition,
    reorderComposition: handleReorder,
    bulkDelete: handleBulkDelete,
  };
}
