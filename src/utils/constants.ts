/**
 * Application constants
 */

/**
 * Speaker color palette
 * Colors are assigned to speakers in a round-robin fashion using speaker ID modulo array length
 */
export const SPEAKER_COLORS = [
  '#2a5a9c', // Blue
  '#9c2a5a', // Pink
  '#2a9c5a', // Green
  '#a15f3f', // Brown
  '#c0392b', // Red
  '#16a085', // Teal
  '#f39c12', // Orange
  '#8e44ad', // Purple
  '#27ae60', // Light Green
  '#2980b9'  // Light Blue
];

/**
 * Epsilon value for highlighting tolerance (milliseconds)
 * Used for fuzzy matching when highlighting current playback position
 */
export const EPS = 30;

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  /** Prefix for localStorage cache keys */
  PREFIX: 'asr_cache_',
  /** Key for cache index in localStorage */
  INDEX_KEY: 'asr_cache_index',
  /** Maximum number of cached results */
  MAX_ENTRIES: 50,
  /** Maximum cache size in bytes (approximate) */
  MAX_SIZE_BYTES: 5 * 1024 * 1024 // 5MB
};

/**
 * Paragraph grouping configuration
 * These values are used by the smart paragraph grouping algorithm
 */
export const PARAGRAPH_CONFIG = {
  /** Pause threshold in milliseconds for paragraph breaks */
  PAUSE_THRESHOLD: 5000,
  /** Minimum paragraph length in characters */
  MIN_LENGTH: 20,
  /** Maximum paragraph length in characters */
  MAX_LENGTH: 500,
  /** Ideal number of sentences per paragraph */
  IDEAL_SENTENCES: 15
};

/**
 * Character-level editing configuration
 */
export const CHAR_EDIT_CONFIG = {
  /** Minimum token duration in milliseconds when timing is incomplete */
  MIN_TOKEN_DURATION: 100
};

/**
 * Server status update interval (milliseconds)
 */
export const SERVER_STATUS_UPDATE_INTERVAL = 2000;

/**
 * Default API endpoint
 */
export const DEFAULT_ENDPOINT = '/asr';

/**
 * Chat configuration
 */
export const CHAT_CONFIG = {
  /** Maximum messages to keep in chat history */
  MAX_HISTORY: 20,
  /** Trim to this many messages when limit is exceeded */
  TRIM_TO: 10
};

/**
 * Gets the color for a speaker ID
 * @param speakerId - Speaker ID number
 * @returns Hex color string
 */
export function getSpeakerColor(speakerId: number): string {
  const index = Math.abs(speakerId) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[index];
}
