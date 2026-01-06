/**
 * Editor Store - Manages the main editor state including recognition results,
 * composition arrays, display modes, and editing state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Segment, CharUnit, DisplayMode } from '@/types';

interface EditorState {
  // Recognition results
  lastFullText: string;
  lastSegments: Segment[];
  charLevelData: CharUnit[];

  // Composition arrays (critical for editing)
  composition: number[]; // segment indices
  charComposition: number[]; // character indices

  // Smart paragraph groups
  smartParagraphGroups: number[][];
  isSmartParagraphManuallyEdited: boolean;

  // Modes
  isCharEditMode: boolean;
  displayMode: DisplayMode;

  // Editing state
  hasEdited: boolean;
  insertAfterIndex: number | null;

  // Playback state
  editedPlaying: boolean;
  editedPlayPos: number;

  // Drag state
  dragSrcIdx: number | null;

  // Actions
  setRecognitionResult: (
    fullText: string,
    segments: Segment[],
    charLevelData?: CharUnit[]
  ) => void;
  deleteAtPosition: (index: number) => void;
  deleteCharAtPosition: (index: number) => void;
  deleteMultiplePositions: (indices: number[]) => void;
  deleteMultipleCharPositions: (indices: number[]) => void;
  reorderComposition: (fromIndex: number, toIndex: number) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  toggleCharEditMode: () => void;
  setCharEditMode: (enabled: boolean) => void;
  setInsertAfterIndex: (index: number | null) => void;
  resetEdits: () => void;
  clearAll: () => void;
  setDragSrcIdx: (index: number | null) => void;
  setEditedPlaying: (playing: boolean) => void;
  setEditedPlayPos: (pos: number) => void;
  updateComposition: (composition: number[]) => void;
  updateCharComposition: (charComposition: number[]) => void;
  setSmartParagraphGroups: (groups: number[][]) => void;
  setSmartParagraphManuallyEdited: (edited: boolean) => void;
  deleteByText: (text: string) => void;
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    // Initial state
    lastFullText: '',
    lastSegments: [],
    charLevelData: [],
    composition: [],
    charComposition: [],
    smartParagraphGroups: [],
    isSmartParagraphManuallyEdited: false,
    isCharEditMode: false,
    displayMode:
      (localStorage.getItem('displayMode') as DisplayMode) || 'continuous',
    hasEdited: false,
    insertAfterIndex: null,
    editedPlaying: false,
    editedPlayPos: 0,
    dragSrcIdx: null,

    // Actions
    setRecognitionResult: (fullText, segments, charLevelData = []) => {
      set((state) => {
        state.lastFullText = fullText;
        state.lastSegments = segments;
        state.charLevelData = charLevelData;
        state.composition = segments.map((_, i) => i);
        state.charComposition = charLevelData.map((_, i) => i);
        state.hasEdited = false;
        state.editedPlaying = false;
        state.editedPlayPos = 0;
        state.isSmartParagraphManuallyEdited = false;
      });
    },

    deleteAtPosition: (index) => {
      set((state) => {
        state.composition = state.composition.filter((_, i) => i !== index);
        state.hasEdited = true;
        // If in smart paragraph mode, mark as manually edited
        if (state.displayMode === 'smart-paragraph') {
          state.isSmartParagraphManuallyEdited = true;
        }
      });
    },

    deleteCharAtPosition: (index) => {
      set((state) => {
        state.charComposition = state.charComposition.filter(
          (_, i) => i !== index
        );
        state.hasEdited = true;
      });
    },

    deleteMultiplePositions: (indices) => {
      set((state) => {
        // 创建要删除的索引集合
        const toDelete = new Set(indices);
        state.composition = state.composition.filter((_, i) => !toDelete.has(i));
        state.hasEdited = true;
        if (state.displayMode === 'smart-paragraph') {
          state.isSmartParagraphManuallyEdited = true;
          // 重新计算段落分组
          state.smartParagraphGroups = [];
        }
      });
    },

    deleteMultipleCharPositions: (indices) => {
      set((state) => {
        const toDelete = new Set(indices);
        state.charComposition = state.charComposition.filter((_, i) => !toDelete.has(i));
        state.hasEdited = true;
      });
    },

    reorderComposition: (fromIndex, toIndex) => {
      set((state) => {
        const newComposition = [...state.composition];
        const [removed] = newComposition.splice(fromIndex, 1);
        newComposition.splice(toIndex, 0, removed);
        state.composition = newComposition;
        state.hasEdited = true;
        // If in smart paragraph mode, mark as manually edited
        if (state.displayMode === 'smart-paragraph') {
          state.isSmartParagraphManuallyEdited = true;
        }
      });
    },

    setDisplayMode: (mode) => {
      set((state) => {
        state.displayMode = mode;
      });
      localStorage.setItem('displayMode', mode);
    },

    toggleCharEditMode: () => {
      set((state) => {
        state.isCharEditMode = !state.isCharEditMode;
      });
    },

    setCharEditMode: (enabled) => {
      set((state) => {
        state.isCharEditMode = enabled;
      });
    },

    setInsertAfterIndex: (index) => {
      set((state) => {
        state.insertAfterIndex = index;
      });
    },

    resetEdits: () => {
      set((state) => {
        // Reset composition arrays to original state
        state.composition = state.lastSegments.map((_, i) => i);
        state.charComposition = state.charLevelData.map((_, i) => i);
        state.hasEdited = false;
        state.editedPlaying = false;
        state.editedPlayPos = 0;
        state.insertAfterIndex = null;
        state.isSmartParagraphManuallyEdited = false;
        // Reset smart paragraph groups will be recalculated
        state.smartParagraphGroups = [];
      });
    },

    clearAll: () => {
      set((state) => {
        // Clear all recognition results and editor state
        state.lastFullText = '';
        state.lastSegments = [];
        state.charLevelData = [];
        state.composition = [];
        state.charComposition = [];
        state.smartParagraphGroups = [];
        state.isSmartParagraphManuallyEdited = false;
        state.isCharEditMode = false;
        state.hasEdited = false;
        state.insertAfterIndex = null;
        state.editedPlaying = false;
        state.editedPlayPos = 0;
        state.dragSrcIdx = null;
      });
    },

    setDragSrcIdx: (index) => {
      set((state) => {
        state.dragSrcIdx = index;
      });
    },

    setEditedPlaying: (playing) => {
      set((state) => {
        state.editedPlaying = playing;
      });
    },

    setEditedPlayPos: (pos) => {
      set((state) => {
        state.editedPlayPos = pos;
      });
    },

    updateComposition: (composition) => {
      set((state) => {
        state.composition = composition;
        state.hasEdited = true;
      });
    },

    updateCharComposition: (charComposition) => {
      set((state) => {
        state.charComposition = charComposition;
        state.hasEdited = true;
      });
    },

    setSmartParagraphGroups: (groups) => {
      set((state) => {
        state.smartParagraphGroups = groups;
      });
    },

    setSmartParagraphManuallyEdited: (edited) => {
      set((state) => {
        state.isSmartParagraphManuallyEdited = edited;
      });
    },

    deleteByText: (text) => {
      set((state) => {
        // 去除末尾标点进行匹配
        const normalizedText = text
          .replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
          .trim();

        if (state.isCharEditMode) {
          const toDelete: number[] = [];
          for (let i = 0; i < state.charComposition.length; i++) {
            const idx = state.charComposition[i];
            const char = state.charLevelData[idx];
            const charText = char?.char
              ?.replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
              .trim();
            if (charText === normalizedText) {
              toDelete.push(i);
            }
          }
          const toDeleteSet = new Set(toDelete);
          state.charComposition = state.charComposition.filter(
            (_, i) => !toDeleteSet.has(i)
          );
        } else {
          const toDelete: number[] = [];
          for (let i = 0; i < state.composition.length; i++) {
            const idx = state.composition[i];
            const seg = state.lastSegments[idx];
            const segText = seg?.text
              ?.replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
              .trim();
            if (segText === normalizedText) {
              toDelete.push(i);
            }
          }
          const toDeleteSet = new Set(toDelete);
          state.composition = state.composition.filter(
            (_, i) => !toDeleteSet.has(i)
          );
        }

        state.hasEdited = true;
        if (state.displayMode === 'smart-paragraph') {
          state.isSmartParagraphManuallyEdited = true;
          state.smartParagraphGroups = [];
        }
      });
    },
  }))
);
