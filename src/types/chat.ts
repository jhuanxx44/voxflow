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
