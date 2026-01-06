/**
 * UI-related type definitions
 */

export type Theme = 'dark' | 'light';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetIndex: number;
}
