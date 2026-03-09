/**
 * Editor Store - Manages the main editor state including recognition results,
 * composition arrays, display modes, and editing state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Segment, CharUnit, DisplayMode } from '@/types';

/** Fields tracked by undo/redo history */
interface UndoableState {
  composition: number[];
  charComposition: number[];
  lastSegments: Segment[];
  charLevelData: CharUnit[];
  smartParagraphGroups: number[][];
  isSmartParagraphManuallyEdited: boolean;
  speakerNames: Record<number, string>;
  speakerMerges: Record<number, number>;
  hasEdited: boolean;
}

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

  // Speaker names mapping (speakerId -> custom name)
  speakerNames: Record<number, string>;
  // Speaker merges mapping (fromSpkId -> toSpkId)
  speakerMerges: Record<number, number>;

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

  // TTS regeneration state
  ttsAudioMap: Record<number, string>;      // segmentIndex → blob URL
  ttsDurationMap: Record<number, number>;    // segmentIndex → duration ms
  ttsGeneratingMap: Record<number, boolean>; // segmentIndex → generating?
  inlineEditIndex: number | null;            // 当前内联编辑的 renderIndex

  // Undo/Redo history (dual-stack)
  _undoStack: UndoableState[];
  _redoStack: UndoableState[];
  _maxHistory: number;

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
  replaceText: (oldText: string, newText: string) => void;
  setSpeakerName: (speakerId: number, name: string) => void;
  mergeSpeaker: (fromSpkId: number, toSpkId: number) => void;
  getEffectiveSpeaker: (spkId: number) => number;

  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // TTS actions
  setTTSAudio: (segmentIndex: number, blobUrl: string, durationMs?: number) => void;
  removeTTSAudio: (segmentIndex: number) => void;
  clearAllTTSAudio: () => void;
  setTTSGenerating: (segmentIndex: number, generating: boolean) => void;
  setInlineEditIndex: (index: number | null) => void;
  replaceSegmentTextByIndex: (segmentIndex: number, newText: string) => void;
}

/**
 * Get the effective speaker ID after applying merges
 * @param spkId - Original speaker ID
 * @param merges - Speaker merges mapping
 * @returns The effective speaker ID (target of merge or original)
 */
export function getEffectiveSpeaker(
  spkId: number,
  merges: Record<number, number>
): number {
  return merges[spkId] ?? spkId;
}

/** Extract undoable fields from state as a plain snapshot */
function takeSnapshot(state: EditorState): UndoableState {
  return {
    composition: [...state.composition],
    charComposition: [...state.charComposition],
    lastSegments: state.lastSegments.map((s) => ({ ...s })),
    charLevelData: state.charLevelData.map((c) => ({ ...c })),
    smartParagraphGroups: state.smartParagraphGroups.map((g) => [...g]),
    isSmartParagraphManuallyEdited: state.isSmartParagraphManuallyEdited,
    speakerNames: { ...state.speakerNames },
    speakerMerges: { ...state.speakerMerges },
    hasEdited: state.hasEdited,
  };
}

/** Save current state to undo stack before a mutation (call inside immer's set callback) */
function pushHistory(state: EditorState): void {
  const snapshot = takeSnapshot(state);
  state._undoStack.push(snapshot);
  // Discard redo stack on new mutation
  state._redoStack = [];
  // Enforce max history limit
  if (state._undoStack.length > state._maxHistory) {
    state._undoStack = state._undoStack.slice(state._undoStack.length - state._maxHistory);
  }
}

/** Restore a snapshot onto the current state (call inside immer's set callback) */
function restoreSnapshot(state: EditorState, snapshot: UndoableState): void {
  state.composition = snapshot.composition;
  state.charComposition = snapshot.charComposition;
  state.lastSegments = snapshot.lastSegments;
  state.charLevelData = snapshot.charLevelData;
  state.smartParagraphGroups = snapshot.smartParagraphGroups;
  state.isSmartParagraphManuallyEdited = snapshot.isSmartParagraphManuallyEdited;
  state.speakerNames = snapshot.speakerNames;
  state.speakerMerges = snapshot.speakerMerges;
  state.hasEdited = snapshot.hasEdited;
}

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    // Initial state
    lastFullText: '',
    lastSegments: [],
    charLevelData: [],
    composition: [],
    charComposition: [],
    smartParagraphGroups: [],
    isSmartParagraphManuallyEdited: false,
    speakerNames: {},
    speakerMerges: {},
    isCharEditMode: false,
    displayMode:
      (localStorage.getItem('displayMode') as DisplayMode) || 'continuous',
    hasEdited: false,
    insertAfterIndex: null,
    editedPlaying: false,
    editedPlayPos: 0,
    dragSrcIdx: null,

    // TTS state
    ttsAudioMap: {},
    ttsDurationMap: {},
    ttsGeneratingMap: {},
    inlineEditIndex: null,

    // Undo/Redo state
    _undoStack: [],
    _redoStack: [],
    _maxHistory: 50,

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
        // Clear history on new recognition
        state._undoStack = [];
        state._redoStack = [];
      });
    },

    deleteAtPosition: (index) => {
      set((state) => {
        pushHistory(state);
        state.composition = state.composition.filter((_, i) => i !== index);
        state.hasEdited = true;
        if (state.displayMode === 'smart-paragraph') {
          state.isSmartParagraphManuallyEdited = true;
        }
      });
    },

    deleteCharAtPosition: (index) => {
      set((state) => {
        pushHistory(state);
        state.charComposition = state.charComposition.filter(
          (_, i) => i !== index
        );
        state.hasEdited = true;
      });
    },

    deleteMultiplePositions: (indices) => {
      set((state) => {
        pushHistory(state);
        const toDelete = new Set(indices);
        state.composition = state.composition.filter((_, i) => !toDelete.has(i));
        state.hasEdited = true;
        if (state.displayMode === 'smart-paragraph') {
          state.isSmartParagraphManuallyEdited = true;
          state.smartParagraphGroups = [];
        }
      });
    },

    deleteMultipleCharPositions: (indices) => {
      set((state) => {
        pushHistory(state);
        const toDelete = new Set(indices);
        state.charComposition = state.charComposition.filter((_, i) => !toDelete.has(i));
        state.hasEdited = true;
      });
    },

    reorderComposition: (fromIndex, toIndex) => {
      set((state) => {
        pushHistory(state);
        const newComposition = [...state.composition];
        const [removed] = newComposition.splice(fromIndex, 1);
        newComposition.splice(toIndex, 0, removed);
        state.composition = newComposition;
        state.hasEdited = true;
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
        for (const url of Object.values(state.ttsAudioMap)) {
          URL.revokeObjectURL(url);
        }
        state.composition = state.lastSegments.map((_, i) => i);
        state.charComposition = state.charLevelData.map((_, i) => i);
        state.hasEdited = false;
        state.editedPlaying = false;
        state.editedPlayPos = 0;
        state.insertAfterIndex = null;
        state.isSmartParagraphManuallyEdited = false;
        state.smartParagraphGroups = [];
        state.speakerNames = {};
        state.speakerMerges = {};
        state.ttsAudioMap = {};
        state.ttsDurationMap = {};
        state.ttsGeneratingMap = {};
        state.inlineEditIndex = null;
        // Clear history on reset
        state._undoStack = [];
        state._redoStack = [];
      });
    },

    clearAll: () => {
      set((state) => {
        for (const url of Object.values(state.ttsAudioMap)) {
          URL.revokeObjectURL(url);
        }
        state.lastFullText = '';
        state.lastSegments = [];
        state.charLevelData = [];
        state.composition = [];
        state.charComposition = [];
        state.smartParagraphGroups = [];
        state.isSmartParagraphManuallyEdited = false;
        state.speakerNames = {};
        state.speakerMerges = {};
        state.isCharEditMode = false;
        state.hasEdited = false;
        state.insertAfterIndex = null;
        state.editedPlaying = false;
        state.editedPlayPos = 0;
        state.dragSrcIdx = null;
        state.ttsAudioMap = {};
        state.ttsDurationMap = {};
        state.ttsGeneratingMap = {};
        state.inlineEditIndex = null;
        // Clear history on clearAll
        state._undoStack = [];
        state._redoStack = [];
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
        pushHistory(state);
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

    replaceText: (oldText, newText) => {
      set((state) => {
        pushHistory(state);
        // 不再规范化，直接使用原始文本进行部分匹配
        const searchText = oldText.trim();
        if (!searchText) {
          console.warn('[replaceText] Empty search text, skipping');
          return;
        }

        console.log('[replaceText] Called with:', { oldText, newText, searchText });
        console.log('[replaceText] isCharEditMode:', state.isCharEditMode);

        let hasReplaced = false;
        let replaceCount = 0;

        if (state.isCharEditMode) {
          // 逐字模式：替换 charLevelData 中包含 oldText 的 char
          const newCharLevelData = [...state.charLevelData];
          for (let i = 0; i < state.charComposition.length; i++) {
            const idx = state.charComposition[i];
            const char = newCharLevelData[idx];
            if (!char) continue;

            // 使用 includes 进行部分匹配
            if (char.char.includes(searchText)) {
              const newCharText = char.char.replaceAll(searchText, newText);
              console.log('[replaceText] Char match found:', {
                idx,
                original: char.char,
                replaced: newCharText,
              });
              newCharLevelData[idx] = {
                ...char,
                char: newCharText,
              };
              hasReplaced = true;
              replaceCount++;
            }
          }
          if (hasReplaced) {
            state.charLevelData = newCharLevelData;
          }
        } else {
          // 逐段模式：替换 lastSegments 中包含 oldText 的 text
          const newSegments = [...state.lastSegments];
          console.log('[replaceText] Checking', state.composition.length, 'segments in composition');

          for (let i = 0; i < state.composition.length; i++) {
            const idx = state.composition[i];
            const seg = newSegments[idx];
            if (!seg) continue;

            // 使用 includes 进行部分匹配
            if (seg.text.includes(searchText)) {
              const newSegText = seg.text.replaceAll(searchText, newText);
              console.log('[replaceText] Segment match found:', {
                idx,
                original: seg.text,
                replaced: newSegText,
              });
              newSegments[idx] = {
                ...seg,
                text: newSegText,
              };
              hasReplaced = true;
              replaceCount++;
            }
          }
          if (hasReplaced) {
            state.lastSegments = newSegments;
          }
        }

        console.log('[replaceText] Result:', { hasReplaced, replaceCount });

        if (hasReplaced) {
          state.hasEdited = true;
          if (state.displayMode === 'smart-paragraph') {
            state.isSmartParagraphManuallyEdited = true;
            state.smartParagraphGroups = [];
          }
        }
      });
    },

    setSpeakerName: (speakerId, name) => {
      set((state) => {
        pushHistory(state);
        if (name.trim()) {
          state.speakerNames[speakerId] = name.trim();
        } else {
          delete state.speakerNames[speakerId];
        }
      });
    },

    mergeSpeaker: (fromSpkId, toSpkId) => {
      set((state) => {
        pushHistory(state);
        // Update any existing merges that point to fromSpkId to point to toSpkId
        // This keeps the mapping flat (no chains)
        for (const key in state.speakerMerges) {
          if (state.speakerMerges[Number(key)] === fromSpkId) {
            state.speakerMerges[Number(key)] = toSpkId;
          }
        }
        // Set the new merge
        state.speakerMerges[fromSpkId] = toSpkId;
        // Transfer custom name if fromSpkId has one and toSpkId doesn't
        if (state.speakerNames[fromSpkId] && !state.speakerNames[toSpkId]) {
          state.speakerNames[toSpkId] = state.speakerNames[fromSpkId];
        }
        // Remove fromSpkId's custom name
        delete state.speakerNames[fromSpkId];
        state.hasEdited = true;
      });
    },

    getEffectiveSpeaker: (spkId) => {
      // This is a getter, we need to access state differently
      // Since immer doesn't support getters well, we'll handle this in components
      return spkId;
    },

    // TTS actions
    setTTSAudio: (segmentIndex, blobUrl, durationMs) => {
      set((state) => {
        state.ttsAudioMap[segmentIndex] = blobUrl;
        if (durationMs !== undefined) {
          state.ttsDurationMap[segmentIndex] = durationMs;
        }
        state.ttsGeneratingMap[segmentIndex] = false;
      });
    },

    removeTTSAudio: (segmentIndex) => {
      set((state) => {
        const url = state.ttsAudioMap[segmentIndex];
        if (url) {
          URL.revokeObjectURL(url);
        }
        delete state.ttsAudioMap[segmentIndex];
        delete state.ttsDurationMap[segmentIndex];
        delete state.ttsGeneratingMap[segmentIndex];
      });
    },

    clearAllTTSAudio: () => {
      set((state) => {
        for (const url of Object.values(state.ttsAudioMap)) {
          URL.revokeObjectURL(url);
        }
        state.ttsAudioMap = {};
        state.ttsDurationMap = {};
        state.ttsGeneratingMap = {};
      });
    },

    setTTSGenerating: (segmentIndex, generating) => {
      set((state) => {
        state.ttsGeneratingMap[segmentIndex] = generating;
      });
    },

    setInlineEditIndex: (index) => {
      set((state) => {
        state.inlineEditIndex = index;
      });
    },

    replaceSegmentTextByIndex: (segmentIndex, newText) => {
      set((state) => {
        pushHistory(state);
        if (segmentIndex >= 0 && segmentIndex < state.lastSegments.length) {
          state.lastSegments[segmentIndex].text = newText;
        }
      });
    },

    // Undo/Redo actions
    undo: () => {
      set((state) => {
        if (state._undoStack.length === 0) return;
        // Save current state to redo stack
        state._redoStack.push(takeSnapshot(state));
        // Pop from undo stack and restore
        const snapshot = state._undoStack.pop()!;
        restoreSnapshot(state, snapshot);
      });
    },

    redo: () => {
      set((state) => {
        if (state._redoStack.length === 0) return;
        // Save current state to undo stack
        state._undoStack.push(takeSnapshot(state));
        // Pop from redo stack and restore
        const snapshot = state._redoStack.pop()!;
        restoreSnapshot(state, snapshot);
      });
    },

    canUndo: () => {
      return get()._undoStack.length > 0;
    },

    canRedo: () => {
      return get()._redoStack.length > 0;
    },
  }))
);
