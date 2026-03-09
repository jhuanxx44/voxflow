/**
 * UI Store - Manages UI state including theme, modals, context menu,
 * and visibility settings
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Theme, ContextMenuState } from '@/types';

interface UIState {
  // Theme
  theme: Theme;

  // Modals
  materialsModalOpen: boolean;
  adminModalOpen: boolean;

  // Context menu
  contextMenu: ContextMenuState | null;

  // Visibility
  segmentsVisible: boolean;
  debugVisible: boolean;

  // Actions
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setMaterialsModalOpen: (open: boolean) => void;
  setAdminModalOpen: (open: boolean) => void;
  showContextMenu: (x: number, y: number, targetIndex: number, originalIndex?: number) => void;
  hideContextMenu: () => void;
  toggleSegmentsVisible: () => void;
  toggleDebugVisible: () => void;
  setSegmentsVisible: (visible: boolean) => void;
  setDebugVisible: (visible: boolean) => void;
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    // Initial state - load theme from localStorage
    theme: (localStorage.getItem('theme') as Theme) || 'dark',
    materialsModalOpen: false,
    adminModalOpen: false,
    contextMenu: null,
    segmentsVisible: false,
    debugVisible: false,

    // Actions
    toggleTheme: () => {
      set((state) => {
        const newTheme = state.theme === 'dark' ? 'light' : 'dark';
        state.theme = newTheme;
        // Persist to localStorage
        localStorage.setItem('theme', newTheme);
        // Update document class for theme
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${newTheme}-theme`);
      });
    },

    setTheme: (theme) => {
      set((state) => {
        state.theme = theme;
        // Persist to localStorage
        localStorage.setItem('theme', theme);
        // Update document class for theme
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${theme}-theme`);
      });
    },

    setMaterialsModalOpen: (open) => {
      set((state) => {
        state.materialsModalOpen = open;
      });
    },

    setAdminModalOpen: (open) => {
      set((state) => {
        state.adminModalOpen = open;
      });
    },

    showContextMenu: (x, y, targetIndex, originalIndex?) => {
      set((state) => {
        state.contextMenu = {
          visible: true,
          x,
          y,
          targetIndex,
          targetOriginalIndex: originalIndex,
        };
      });
    },

    hideContextMenu: () => {
      set((state) => {
        state.contextMenu = null;
      });
    },

    toggleSegmentsVisible: () => {
      set((state) => {
        state.segmentsVisible = !state.segmentsVisible;
      });
    },

    toggleDebugVisible: () => {
      set((state) => {
        state.debugVisible = !state.debugVisible;
      });
    },

    setSegmentsVisible: (visible) => {
      set((state) => {
        state.segmentsVisible = visible;
      });
    },

    setDebugVisible: (visible) => {
      set((state) => {
        state.debugVisible = visible;
      });
    },
  }))
);

// Initialize theme on module load
const savedTheme = (localStorage.getItem('theme') as Theme) || 'dark';
document.body.classList.add(`${savedTheme}-theme`);
