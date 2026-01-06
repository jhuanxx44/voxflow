/**
 * Chat History Hook - Manages chat message history with max rounds limit
 */

import { useState, useCallback } from 'react';
import type { ChatMessage } from '@/types';

/**
 * Maximum number of conversation rounds to keep (5 rounds = 10 messages)
 */
const MAX_HISTORY_ROUNDS = 5;

/**
 * Hook for managing chat message history
 * @returns Chat history state and actions
 */
export function useChatHistory() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /**
   * Trim chat history to keep only the last N rounds
   */
  const trimChatHistory = useCallback((history: ChatMessage[]) => {
    const maxMessages = MAX_HISTORY_ROUNDS * 2; // Each round has user + assistant
    if (history.length > maxMessages) {
      return history.slice(-maxMessages);
    }
    return history;
  }, []);

  /**
   * Add a new message to the chat history
   */
  const addMessage = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => {
        const updated = [...prev, message];
        return trimChatHistory(updated);
      });
    },
    [trimChatHistory]
  );

  /**
   * Update the last message in the history
   * Useful for streaming updates
   */
  const updateLastMessage = useCallback((content: string, reasoning?: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = {
        ...last,
        content,
        reasoning,
      };
      return updated;
    });
  }, []);

  /**
   * Clear all chat history
   */
  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    addMessage,
    updateLastMessage,
    clearHistory,
  };
}
