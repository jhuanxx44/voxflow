/**
 * ASR-related type definitions for FunASR Audio Editor
 */

/**
 * Word-level timestamp information
 * Array format: [startTime, endTime]
 */
export type WordTimestamp = [number, number];

/**
 * Represents a single segment from ASR recognition
 */
export interface Segment {
  /** Segment text content */
  text: string;
  /** Start time in milliseconds */
  start: number;
  /** End time in milliseconds */
  end: number;
  /** Speaker ID (null if not using speaker diarization) */
  spk: number | null;
  /** Word-level timestamps array (optional, from advanced model) */
  timestamp?: WordTimestamp[];
}

/**
 * Character unit for character-level editing
 * Represents a single token (character, word, or number) with timing information
 */
export interface CharUnit {
  /** Stable Headless token ID used by Edit Plan operations */
  tokenId?: string;
  /** Stable timeline clip ID containing this token */
  clipId?: string;
  /** The character/word/token text */
  char: string;
  /** Start time in milliseconds */
  start: number;
  /** End time in milliseconds */
  end: number;
  /** Index of the segment this unit belongs to */
  segmentIndex: number;
  /** Character index in the original segment text */
  charIndex: number;
  /** Speaker ID */
  spk: number | null;
  /** Whether this unit can be previewed (played) */
  previewable: boolean;
  /** Token type: 'word' (English), 'number', 'char' (Chinese/punctuation), 'space' */
  type: 'word' | 'number' | 'char' | 'space';
}

/**
 * Token returned by tokenization
 */
export interface Token {
  /** Token text */
  text: string;
  /** Start index in original text */
  startIdx: number;
  /** End index in original text */
  endIdx: number;
  /** Token length */
  length: number;
  /** Token type */
  type: 'word' | 'number' | 'char' | 'space';
}

/**
 * Complete ASR recognition result
 */
export interface ASRResult {
  /** Full recognized text */
  full_text: string;
  /** Array of segments */
  segments: Segment[];
}

/**
 * Paragraph group for smart paragraph display mode
 * Contains multiple segments grouped together
 */
export interface ParagraphGroup {
  /** Segments in this paragraph */
  segments: Segment[];
  /** Combined text of all segments */
  text: string;
  /** Start time of the first segment */
  start: number | null;
  /** End time of the last segment */
  end: number | null;
  /** Speaker ID (null if mixed speakers) */
  spk: number | null;
}
