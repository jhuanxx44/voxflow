/**
 * ASR Store - Manages ASR recognition state including files, materials,
 * recognition settings, and server status
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type RecognitionMode = 'basic' | 'advanced';
export type MediaType = 'audio' | 'video';

export interface ServerStatus {
  waiting: number;
  processing: number;
}

interface ASRState {
  // File state
  currentFile: File | null;
  currentMaterial: string | null;
  uploadedFileId: string | null; // 上传文件的 ID，用于导出
  audioUrl: string | null;
  mediaType: MediaType;

  // Recognition state
  isRecognizing: boolean;
  recognitionMode: RecognitionMode;
  hotwords: string;
  usedHotwords: string | null; // Hotwords used in the last recognition

  // Server status
  serverStatus: ServerStatus | null;

  // Cache
  cacheEnabled: boolean;

  // Actions
  setCurrentFile: (file: File | null) => void;
  setCurrentMaterial: (name: string | null) => void;
  setUploadedFileId: (id: string | null) => void;
  setAudioUrl: (url: string | null) => void;
  setMediaType: (type: MediaType) => void;
  setIsRecognizing: (value: boolean) => void;
  setRecognitionMode: (mode: RecognitionMode) => void;
  setHotwords: (words: string) => void;
  setUsedHotwords: (words: string | null) => void;
  setServerStatus: (status: ServerStatus | null) => void;
  toggleCache: () => void;
  setCacheEnabled: (enabled: boolean) => void;
  clearCurrentAudio: () => void;
}

export const useASRStore = create<ASRState>()(
  immer((set) => ({
    // Initial state
    currentFile: null,
    currentMaterial: null,
    uploadedFileId: null,
    audioUrl: null,
    mediaType: 'audio',
    isRecognizing: false,
    recognitionMode: 'advanced', // 默认启用高级识别
    hotwords: '',
    usedHotwords: null,
    serverStatus: null,
    cacheEnabled: true,

    // Actions
    setCurrentFile: (file) => {
      set((state) => {
        state.currentFile = file;
        // Clear material and uploadedFileId when file is set
        if (file) {
          state.currentMaterial = null;
          state.uploadedFileId = null;
        }
      });
    },

    setCurrentMaterial: (name) => {
      set((state) => {
        state.currentMaterial = name;
        // Clear file and uploadedFileId when material is set
        if (name) {
          state.currentFile = null;
          state.uploadedFileId = null;
        }
      });
    },

    setUploadedFileId: (id) => {
      set((state) => {
        state.uploadedFileId = id;
      });
    },

    setAudioUrl: (url) => {
      set((state) => {
        state.audioUrl = url;
      });
    },

    setMediaType: (type) => {
      set((state) => {
        state.mediaType = type;
      });
    },

    setIsRecognizing: (value) => {
      set((state) => {
        state.isRecognizing = value;
      });
    },

    setRecognitionMode: (mode) => {
      set((state) => {
        state.recognitionMode = mode;
      });
    },

    setHotwords: (words) => {
      set((state) => {
        state.hotwords = words;
      });
    },

    setUsedHotwords: (words) => {
      set((state) => {
        state.usedHotwords = words;
      });
    },

    setServerStatus: (status) => {
      set((state) => {
        state.serverStatus = status;
      });
    },

    toggleCache: () => {
      set((state) => {
        state.cacheEnabled = !state.cacheEnabled;
      });
    },

    setCacheEnabled: (enabled) => {
      set((state) => {
        state.cacheEnabled = enabled;
      });
    },

    clearCurrentAudio: () => {
      set((state) => {
        state.currentFile = null;
        state.currentMaterial = null;
        state.uploadedFileId = null;
        state.audioUrl = null;
        state.mediaType = 'audio';
        state.hotwords = '';
        state.usedHotwords = null;
      });
    },
  }))
);
