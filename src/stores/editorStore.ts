/** Project-backed editor view cache and deterministic Edit Plan actions. */

import { create } from 'zustand';
import type { CharUnit, DisplayMode, Segment } from '@/types';
import type {
  AttachSpeechReplacementV1,
  EditOperationV1,
  ProjectEditorSnapshot,
  SpeechReplacementCandidateV1,
  TimelineClipV1,
  TranscriptTokenV1,
} from '@/types/project';
import {
  applyEdit,
  loadProjectEditor,
  ProjectApiError,
  restoreRevision,
} from '@/services/projectService';

const CURRENT_PROJECT_KEY = 'voxflow.currentProjectId';

interface EditorState {
  projectId: string | null;
  projectName: string;
  revision: number;
  sourceUrl: string | null;
  timelineClips: TimelineClipV1[];
  isCommitting: boolean;
  lastError: string | null;
  revisionConflict: boolean;

  lastFullText: string;
  lastSegments: Segment[];
  charLevelData: CharUnit[];
  composition: number[];
  charComposition: number[];
  smartParagraphGroups: number[][];
  isSmartParagraphManuallyEdited: boolean;
  speakerNames: Record<number, string>;
  speakerMerges: Record<number, number>;
  isCharEditMode: boolean;
  displayMode: DisplayMode;
  hasEdited: boolean;
  insertAfterIndex: number | null;
  editedPlaying: boolean;
  editedPlayPos: number;
  dragSrcIdx: number | null;

  ttsAudioMap: Record<number, string>;
  ttsDurationMap: Record<number, number>;
  ttsGeneratingMap: Record<number, boolean>;
  ttsCandidateMap: Record<number, SpeechReplacementCandidateV1>;
  inlineEditIndex: number | null;

  _undoStack: number[];
  _redoStack: number[];
  _maxHistory: number;

  hydrateProject: (snapshot: ProjectEditorSnapshot, preserveHistory?: boolean) => void;
  loadProject: (projectId: string, preserveHistory?: boolean) => Promise<ProjectEditorSnapshot>;
  refreshProject: () => Promise<void>;
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
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setTTSAudio: (segmentIndex: number, blobUrl: string, durationMs?: number) => void;
  removeTTSAudio: (segmentIndex: number) => void;
  clearAllTTSAudio: () => void;
  setTTSGenerating: (segmentIndex: number, generating: boolean) => void;
  setTTSCandidate: (segmentIndex: number, candidate: SpeechReplacementCandidateV1) => void;
  removeTTSCandidate: (segmentIndex: number) => void;
  applySpeechCandidate: (
    segmentIndex: number,
    operation: AttachSpeechReplacementV1
  ) => Promise<void>;
  setInlineEditIndex: (index: number | null) => void;
  replaceSegmentTextByIndex: (segmentIndex: number, newText: string) => void;
}

type SetEditorState = (
  partial:
    | Partial<EditorState>
    | ((state: EditorState) => Partial<EditorState>)
) => void;

let mutationQueue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  mutationQueue = mutationQueue.then(task, task);
  return mutationQueue;
}

function revokeBlobUrl(url: string | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

function speakerNumber(speakerId: string | null): number | null {
  if (!speakerId) return null;
  const match = /^spk_(\d+)$/.exec(speakerId);
  return match ? Number(match[1]) : null;
}

function speakerStableId(speakerId: number): string {
  return `spk_${speakerId}`;
}

export function getEffectiveSpeaker(
  spkId: number,
  merges: Record<number, number>
): number {
  return merges[spkId] ?? spkId;
}

function snapshotView(snapshot: ProjectEditorSnapshot): Partial<EditorState> {
  const tokenMap = new Map<string, TranscriptTokenV1>();
  for (const segment of snapshot.transcript.items) {
    for (const token of segment.tokens) tokenMap.set(token.id, token);
  }

  const lastSegments: Segment[] = snapshot.timeline.items.map((clip) => ({
    text: clip.transcript_text,
    start: clip.source_in_ms,
    end: clip.source_out_ms,
    spk: speakerNumber(clip.speaker_id),
    timestamp: clip.token_ids
      .map((tokenId) => tokenMap.get(tokenId))
      .filter((token): token is TranscriptTokenV1 => Boolean(token))
      .map((token) => [token.start_ms, token.end_ms]),
  }));

  const charLevelData: CharUnit[] = [];
  snapshot.timeline.items.forEach((clip, clipIndex) => {
    clip.token_ids.forEach((tokenId, tokenIndex) => {
      const token = tokenMap.get(tokenId);
      if (!token) return;
      charLevelData.push({
        char: token.text,
        start: token.start_ms,
        end: token.end_ms,
        segmentIndex: clipIndex,
        charIndex: tokenIndex,
        spk: speakerNumber(clip.speaker_id),
        previewable: true,
        type: token.type,
        tokenId: token.id,
        clipId: clip.id,
      });
    });
  });

  const speakerNames: Record<number, string> = {};
  for (const [speakerId, name] of Object.entries(snapshot.timeline.speaker_labels)) {
    const parsed = speakerNumber(speakerId);
    if (parsed !== null) speakerNames[parsed] = name;
  }
  const speakerMerges: Record<number, number> = {};
  for (const [source, target] of Object.entries(snapshot.timeline.speaker_merges)) {
    const parsedSource = speakerNumber(source);
    const parsedTarget = speakerNumber(target);
    if (parsedSource !== null && parsedTarget !== null) {
      speakerMerges[parsedSource] = parsedTarget;
    }
  }

  const ttsAudioMap: Record<number, string> = {};
  const ttsDurationMap: Record<number, number> = {};
  snapshot.timeline.items.forEach((clip, index) => {
    if (!clip.replacement_artifact_id) return;
    ttsAudioMap[index] = `/api/v1/artifacts/${clip.replacement_artifact_id}/content`;
    if (clip.replacement_duration_ms) {
      ttsDurationMap[index] = clip.replacement_duration_ms;
    }
  });

  return {
    projectId: snapshot.project.id,
    projectName: snapshot.project.name,
    revision: snapshot.timeline.revision,
    sourceUrl: snapshot.project.source_url,
    timelineClips: snapshot.timeline.items,
    lastFullText: snapshot.timeline.items.map((clip) => clip.transcript_text).join(''),
    lastSegments,
    charLevelData,
    composition: lastSegments.map((_, index) => index),
    charComposition: charLevelData.map((_, index) => index),
    speakerNames,
    speakerMerges,
    smartParagraphGroups: [],
    isSmartParagraphManuallyEdited: false,
    hasEdited: snapshot.timeline.revision > 1,
    editedPlaying: false,
    editedPlayPos: 0,
    insertAfterIndex: null,
    revisionConflict: false,
    lastError: null,
    ttsAudioMap,
    ttsDurationMap,
    ttsGeneratingMap: {},
    ttsCandidateMap: {},
  };
}

function setApiError(set: SetEditorState, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  set({
    isCommitting: false,
    lastError: message,
    revisionConflict:
      error instanceof ProjectApiError && error.code === 'REVISION_CONFLICT',
  });
  if (error instanceof ProjectApiError && error.code === 'REVISION_CONFLICT') {
    console.info('[VoxFlow project edit] revision conflict handled by refresh');
  } else {
    console.error('[VoxFlow project edit]', error);
  }
}

function queueEdit(
  get: () => EditorState,
  set: SetEditorState,
  buildOperations: (state: EditorState) => EditOperationV1[],
  reason: string
): void {
  enqueue(async () => {
    const before = get();
    if (!before.projectId) {
      set({ lastError: '当前编辑器没有持久化 project' });
      return;
    }
    const operations = buildOperations(before);
    if (operations.length === 0) return;
    const projectId = before.projectId;
    const baseRevision = before.revision;
    set({ isCommitting: true, lastError: null, revisionConflict: false });
    try {
      await applyEdit(projectId, baseRevision, operations, reason);
      const snapshot = await loadProjectEditor(projectId);
      const latest = get();
      set({
        ...snapshotView(snapshot),
        isCommitting: false,
        _undoStack: [...latest._undoStack, baseRevision].slice(-latest._maxHistory),
        _redoStack: [],
      });
    } catch (error) {
      setApiError(set, error);
      if (error instanceof ProjectApiError && error.code === 'REVISION_CONFLICT') {
        try {
          const snapshot = await loadProjectEditor(projectId);
          set({ ...snapshotView(snapshot), revisionConflict: true });
        } catch (refreshError) {
          setApiError(set, refreshError);
        }
      }
    }
  });
}

const initialState = {
  projectId: null,
  projectName: '',
  revision: 0,
  sourceUrl: null,
  timelineClips: [],
  isCommitting: false,
  lastError: null,
  revisionConflict: false,
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
  ttsAudioMap: {},
  ttsDurationMap: {},
  ttsGeneratingMap: {},
  ttsCandidateMap: {},
  inlineEditIndex: null,
  _undoStack: [],
  _redoStack: [],
  _maxHistory: 50,
} satisfies Omit<
  EditorState,
  | 'hydrateProject'
  | 'loadProject'
  | 'refreshProject'
  | 'setRecognitionResult'
  | 'deleteAtPosition'
  | 'deleteCharAtPosition'
  | 'deleteMultiplePositions'
  | 'deleteMultipleCharPositions'
  | 'reorderComposition'
  | 'setDisplayMode'
  | 'toggleCharEditMode'
  | 'setCharEditMode'
  | 'setInsertAfterIndex'
  | 'resetEdits'
  | 'clearAll'
  | 'setDragSrcIdx'
  | 'setEditedPlaying'
  | 'setEditedPlayPos'
  | 'updateComposition'
  | 'updateCharComposition'
  | 'setSmartParagraphGroups'
  | 'setSmartParagraphManuallyEdited'
  | 'deleteByText'
  | 'replaceText'
  | 'setSpeakerName'
  | 'mergeSpeaker'
  | 'getEffectiveSpeaker'
  | 'undo'
  | 'redo'
  | 'canUndo'
  | 'canRedo'
  | 'setTTSAudio'
  | 'removeTTSAudio'
  | 'clearAllTTSAudio'
  | 'setTTSGenerating'
  | 'setTTSCandidate'
  | 'removeTTSCandidate'
  | 'applySpeechCandidate'
  | 'setInlineEditIndex'
  | 'replaceSegmentTextByIndex'
>;

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  hydrateProject: (snapshot, preserveHistory = false) => {
    localStorage.setItem(CURRENT_PROJECT_KEY, snapshot.project.id);
    set({
      ...snapshotView(snapshot),
      _undoStack: preserveHistory ? get()._undoStack : [],
      _redoStack: preserveHistory ? get()._redoStack : [],
    });
  },

  loadProject: async (projectId, preserveHistory = false) => {
    const snapshot = await loadProjectEditor(projectId);
    get().hydrateProject(snapshot, preserveHistory);
    return snapshot;
  },

  refreshProject: async () => {
    const projectId = get().projectId;
    if (!projectId) return;
    await get().loadProject(projectId, true);
  },

  setRecognitionResult: (fullText, segments, charLevelData = []) => {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
    set({
      projectId: null,
      revision: 0,
      sourceUrl: null,
      timelineClips: [],
      lastFullText: fullText,
      lastSegments: segments,
      charLevelData,
      composition: segments.map((_, index) => index),
      charComposition: charLevelData.map((_, index) => index),
      hasEdited: false,
      _undoStack: [],
      _redoStack: [],
    });
  },

  deleteAtPosition: (index) =>
    queueEdit(
      get,
      set,
      (state) => {
        const clip = state.timelineClips[state.composition[index]];
        return clip ? [{ op: 'delete_clips', clip_ids: [clip.id] }] : [];
      },
      'Web: delete segment'
    ),

  deleteCharAtPosition: (index) =>
    queueEdit(
      get,
      set,
      (state) => {
        const unit = state.charLevelData[state.charComposition[index]];
        if (!unit?.clipId || !unit.tokenId) {
          set({ lastError: '该片段没有稳定 token 时间戳，无法执行词级删除' });
          return [];
        }
        return [
          {
            op: 'delete_ranges',
            clip_id: unit.clipId,
            start_token_id: unit.tokenId,
            end_token_id: unit.tokenId,
          },
        ];
      },
      'Web: delete token'
    ),

  deleteMultiplePositions: (indices) =>
    queueEdit(
      get,
      set,
      (state) => {
        const clipIds = indices
          .map((index) => state.timelineClips[state.composition[index]]?.id)
          .filter((id): id is string => Boolean(id));
        return clipIds.length ? [{ op: 'delete_clips', clip_ids: [...new Set(clipIds)] }] : [];
      },
      'Web: delete segments'
    ),

  deleteMultipleCharPositions: (indices) =>
    queueEdit(
      get,
      set,
      (state) => {
        const units = indices
          .map((index) => state.charLevelData[state.charComposition[index]])
          .filter((unit): unit is CharUnit & { clipId: string; tokenId: string } =>
            Boolean(unit?.clipId && unit.tokenId)
          );
        const byClip = new Map<string, string[]>();
        for (const unit of units) {
          byClip.set(unit.clipId, [...(byClip.get(unit.clipId) || []), unit.tokenId]);
        }
        const operations: EditOperationV1[] = [];
        for (const [clipId, tokenIds] of byClip) {
          const clip = state.timelineClips.find((item) => item.id === clipId);
          if (!clip) continue;
          const selected = clip.token_ids
            .map((tokenId, position) => ({ tokenId, position }))
            .filter(({ tokenId }) => tokenIds.includes(tokenId));
          if (!selected.length) continue;
          const positions = selected.map((item) => item.position);
          if (Math.max(...positions) - Math.min(...positions) + 1 !== positions.length) {
            set({ lastError: '同一片段内的多处不连续词级删除请分次执行' });
            return [];
          }
          operations.push({
            op: 'delete_ranges',
            clip_id: clipId,
            start_token_id: selected[0].tokenId,
            end_token_id: selected[selected.length - 1].tokenId,
          });
        }
        return operations;
      },
      'Web: delete token range'
    ),

  reorderComposition: (fromIndex, toIndex) =>
    queueEdit(
      get,
      set,
      (state) => {
        const source = state.timelineClips[state.composition[fromIndex]];
        const anchor = state.timelineClips[state.composition[toIndex]];
        if (!source || !anchor || source.id === anchor.id) return [];
        return [
          {
            op: 'move_clip',
            clip_id: source.id,
            anchor_clip_id: anchor.id,
            position: fromIndex < toIndex ? 'after' : 'before',
          },
        ];
      },
      'Web: reorder segment'
    ),

  setDisplayMode: (displayMode) => {
    localStorage.setItem('displayMode', displayMode);
    set({ displayMode });
  },
  toggleCharEditMode: () => set((state) => ({ isCharEditMode: !state.isCharEditMode })),
  setCharEditMode: (isCharEditMode) => set({ isCharEditMode }),
  setInsertAfterIndex: (insertAfterIndex) => set({ insertAfterIndex }),

  resetEdits: () => {
    if (!get().projectId || get().revision <= 1) return;
    const target = 1;
    enqueue(async () => {
      const before = get();
      if (!before.projectId) return;
      set({ isCommitting: true, lastError: null });
      try {
        await restoreRevision(before.projectId, before.revision, target);
        const snapshot = await loadProjectEditor(before.projectId);
        set({
          ...snapshotView(snapshot),
          isCommitting: false,
          _undoStack: [...before._undoStack, before.revision],
          _redoStack: [],
        });
      } catch (error) {
        setApiError(set, error);
      }
    });
  },

  clearAll: () => {
    for (const url of Object.values(get().ttsAudioMap)) revokeBlobUrl(url);
    localStorage.removeItem(CURRENT_PROJECT_KEY);
    set({ ...initialState, displayMode: get().displayMode });
  },
  setDragSrcIdx: (dragSrcIdx) => set({ dragSrcIdx }),
  setEditedPlaying: (editedPlaying) => set({ editedPlaying }),
  setEditedPlayPos: (editedPlayPos) => set({ editedPlayPos }),

  updateComposition: (nextComposition) => {
    const current = get().composition;
    const removed = current
      .map((value, position) => ({ value, position }))
      .filter(({ value }) => !nextComposition.includes(value))
      .map(({ position }) => position);
    if (removed.length) get().deleteMultiplePositions(removed);
  },
  updateCharComposition: (nextComposition) => {
    const current = get().charComposition;
    const removed = current
      .map((value, position) => ({ value, position }))
      .filter(({ value }) => !nextComposition.includes(value))
      .map(({ position }) => position);
    if (removed.length) get().deleteMultipleCharPositions(removed);
  },
  setSmartParagraphGroups: (smartParagraphGroups) => set({ smartParagraphGroups }),
  setSmartParagraphManuallyEdited: (isSmartParagraphManuallyEdited) =>
    set({ isSmartParagraphManuallyEdited }),

  deleteByText: (text) =>
    queueEdit(
      get,
      set,
      (state) => {
        const normalized = text
          .replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
          .trim();
        const ids = state.timelineClips
          .filter(
            (clip) =>
              clip.transcript_text
                .replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
                .trim() === normalized
          )
          .map((clip) => clip.id);
        return ids.length ? [{ op: 'delete_clips', clip_ids: ids }] : [];
      },
      'Web agent: delete matching segments'
    ),

  replaceText: (oldText, newText) =>
    queueEdit(
      get,
      set,
      (state) =>
        state.timelineClips
          .filter((clip) => clip.transcript_text.includes(oldText.trim()))
          .map((clip) => ({
            op: 'correct_transcript' as const,
            clip_id: clip.id,
            text: clip.transcript_text.replaceAll(oldText.trim(), newText),
          })),
      'Web agent: correct transcript'
    ),

  setSpeakerName: (speakerId, name) =>
    queueEdit(
      get,
      set,
      () => [
        {
          op: 'rename_speaker',
          speaker_id: speakerStableId(speakerId),
          name: name.trim(),
        },
      ],
      'Web: rename speaker'
    ),

  mergeSpeaker: (fromSpkId, toSpkId) =>
    queueEdit(
      get,
      set,
      () => [
        {
          op: 'merge_speakers',
          from_speaker_id: speakerStableId(fromSpkId),
          to_speaker_id: speakerStableId(toSpkId),
        },
      ],
      'Web: merge speakers'
    ),
  getEffectiveSpeaker: (spkId) => getEffectiveSpeaker(spkId, get().speakerMerges),

  undo: () => {
    enqueue(async () => {
      const before = get();
      const target = before._undoStack.at(-1);
      if (!before.projectId || target === undefined || before.isCommitting) return;
      set({ isCommitting: true, lastError: null });
      try {
        await restoreRevision(before.projectId, before.revision, target);
        const snapshot = await loadProjectEditor(before.projectId);
        set({
          ...snapshotView(snapshot),
          isCommitting: false,
          _undoStack: before._undoStack.slice(0, -1),
          _redoStack: [...before._redoStack, before.revision],
        });
      } catch (error) {
        setApiError(set, error);
      }
    });
  },

  redo: () => {
    enqueue(async () => {
      const before = get();
      const target = before._redoStack.at(-1);
      if (!before.projectId || target === undefined || before.isCommitting) return;
      set({ isCommitting: true, lastError: null });
      try {
        await restoreRevision(before.projectId, before.revision, target);
        const snapshot = await loadProjectEditor(before.projectId);
        set({
          ...snapshotView(snapshot),
          isCommitting: false,
          _undoStack: [...before._undoStack, before.revision],
          _redoStack: before._redoStack.slice(0, -1),
        });
      } catch (error) {
        setApiError(set, error);
      }
    });
  },
  canUndo: () => get()._undoStack.length > 0 && !get().isCommitting,
  canRedo: () => get()._redoStack.length > 0 && !get().isCommitting,

  setTTSAudio: (segmentIndex, blobUrl, durationMs) =>
    set((state) => {
      revokeBlobUrl(state.ttsAudioMap[segmentIndex]);
      return {
      ttsAudioMap: { ...state.ttsAudioMap, [segmentIndex]: blobUrl },
      ttsDurationMap:
        durationMs === undefined
          ? state.ttsDurationMap
          : { ...state.ttsDurationMap, [segmentIndex]: durationMs },
      ttsGeneratingMap: { ...state.ttsGeneratingMap, [segmentIndex]: false },
      };
    }),
  removeTTSAudio: (segmentIndex) => {
    const url = get().ttsAudioMap[segmentIndex];
    revokeBlobUrl(url);
    set((state) => {
      const ttsAudioMap = { ...state.ttsAudioMap };
      const ttsDurationMap = { ...state.ttsDurationMap };
      const ttsGeneratingMap = { ...state.ttsGeneratingMap };
      delete ttsAudioMap[segmentIndex];
      delete ttsDurationMap[segmentIndex];
      delete ttsGeneratingMap[segmentIndex];
      return { ttsAudioMap, ttsDurationMap, ttsGeneratingMap };
    });
  },
  clearAllTTSAudio: () => {
    for (const url of Object.values(get().ttsAudioMap)) revokeBlobUrl(url);
    set({
      ttsAudioMap: {},
      ttsDurationMap: {},
      ttsGeneratingMap: {},
      ttsCandidateMap: {},
    });
  },
  setTTSGenerating: (segmentIndex, generating) =>
    set((state) => ({
      ttsGeneratingMap: { ...state.ttsGeneratingMap, [segmentIndex]: generating },
    })),
  setTTSCandidate: (segmentIndex, candidate) =>
    set((state) => ({
      ttsCandidateMap: { ...state.ttsCandidateMap, [segmentIndex]: candidate },
    })),
  removeTTSCandidate: (segmentIndex) =>
    set((state) => {
      const ttsCandidateMap = { ...state.ttsCandidateMap };
      delete ttsCandidateMap[segmentIndex];
      return { ttsCandidateMap };
    }),
  applySpeechCandidate: (segmentIndex, operation) =>
    enqueue(async () => {
      const before = get();
      if (!before.projectId || before.isCommitting) return;
      const projectId = before.projectId;
      const baseRevision = before.revision;
      set({ isCommitting: true, lastError: null, revisionConflict: false });
      try {
        await applyEdit(projectId, baseRevision, [operation], 'Web: attach speech replacement');
        const snapshot = await loadProjectEditor(projectId);
        const latest = get();
        set({
          ...snapshotView(snapshot),
          isCommitting: false,
          _undoStack: [...latest._undoStack, baseRevision].slice(-latest._maxHistory),
          _redoStack: [],
        });
      } catch (error) {
        setApiError(set, error);
        if (error instanceof ProjectApiError && error.code === 'REVISION_CONFLICT') {
          try {
            const snapshot = await loadProjectEditor(projectId);
            set({ ...snapshotView(snapshot), revisionConflict: true });
          } catch (refreshError) {
            setApiError(set, refreshError);
          }
        }
        throw error;
      } finally {
        set((state) => {
          const ttsGeneratingMap = { ...state.ttsGeneratingMap };
          delete ttsGeneratingMap[segmentIndex];
          return { ttsGeneratingMap };
        });
      }
    }),
  setInlineEditIndex: (inlineEditIndex) => set({ inlineEditIndex }),
  replaceSegmentTextByIndex: (segmentIndex, newText) =>
    queueEdit(
      get,
      set,
      (state) => {
        const clip = state.timelineClips[segmentIndex];
        return clip
          ? [{ op: 'correct_transcript', clip_id: clip.id, text: newText }]
          : [];
      },
      'Web: edit transcript text'
    ),
}));
