/**
 * Editor state type definitions
 */

import type { Segment, CharUnit } from './asr';

/**
 * Display mode for the editor
 * - continuous: All segments in a single continuous block
 * - line-by-line: Each segment on its own line
 * - smart-paragraph: Segments grouped into paragraphs based on pauses and speakers
 */
export type DisplayMode = 'continuous' | 'line-by-line' | 'smart-paragraph';

/**
 * Composition state for tracking IME input
 * Used to prevent conflicts between IME composition and contenteditable events
 */
export interface CompositionState {
  /** Whether IME composition is in progress */
  isComposing: boolean;
  /** The element being composed in */
  target: HTMLElement | null;
}

/**
 * Complete editor state
 */
export interface EditorState {
  /** Current display mode */
  displayMode: DisplayMode;
  /** Whether character-level editing mode is enabled */
  isCharEditMode: boolean;
  /** Array of segment indices in display order (after user reordering/deletion) */
  composition: number[];
  /** Original segments from ASR */
  segments: Segment[];
  /** Character-level data for char edit mode */
  charLevelData: CharUnit[];
  /** Whether the editor has been manually edited */
  isEdited: boolean;
  /** Smart paragraph groups (array of segment index arrays) */
  smartParagraphGroups: number[][];
  /** Whether smart paragraph grouping has been manually edited */
  isSmartParagraphManuallyEdited: boolean;
}

/**
 * Cache metadata for a recognition result
 */
export interface CacheMetadata {
  /** Unique file identifier */
  fileId: string;
  /** Original filename */
  fileName: string;
  /** Timestamp when cached */
  timestamp: number;
  /** Whether advanced model was used */
  isAdvanced: boolean;
  /** Hotwords used (empty string if none) */
  hotwords: string;
}

/**
 * Cached ASR result with metadata
 */
export interface CachedASRResult {
  /** Full recognized text */
  full_text: string;
  /** Array of segments */
  segments: Segment[];
  /** Cache metadata */
  metadata: CacheMetadata;
}
