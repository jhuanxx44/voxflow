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
        // Clear material when file is set
        if (file) {
          state.currentMaterial = null;
        }
      });
    },

    setCurrentMaterial: (name) => {
      set((state) => {
        state.currentMaterial = name;
        // Clear file when material is set
        if (name) {
          state.currentFile = null;
        }
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
        state.audioUrl = null;
        state.mediaType = 'audio';
        state.hotwords = '';
        state.usedHotwords = null;
      });
    },
  }))
);
