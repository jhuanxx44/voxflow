/**
 * Chat-related type definitions
 */

/**
 * Chat message role
 */
export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * Represents a single chat message
 */
export interface ChatMessage {
  /** Message role (user, assistant, or system) */
  role: ChatRole;
  /** Message content */
  content: string;
  /** Reasoning content (for assistant messages with extended thinking) */
  reasoning?: string;
}

/**
 * Chat history state
 */
export interface ChatHistory {
  /** Array of chat messages */
  messages: ChatMessage[];
  /** Maximum number of messages to keep in history */
  maxMessages: number;
}

/**
 * Filler word detected in ASR result
 */
export interface FillerWord {
  /** The filler word text */
  text: string;
  /** Number of occurrences */
  count: number;
}

/**
 * Result of filler word analysis from LLM
 */
export interface FillerAnalysisResult {
  fillers: FillerWord[];
}

/**
 * Text replacement suggestion from LLM polish analysis
 */
export interface TextReplacement {
  /** Original text to be replaced */
  old: string;
  /** Suggested replacement text */
  new: string;
  /** Number of occurrences */
  count: number;
  /** Reason for replacement */
  reason: string;
}

/**
 * Result of polish analysis from LLM
 */
export interface PolishAnalysisResult {
  replacements: TextReplacement[];
}
