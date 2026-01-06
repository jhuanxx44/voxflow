/**
 * Chat Panel Component - Right-side LLM chat assistant panel
 * Sticky positioned, 380px width, card-style container
 */

import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useChatHistory } from '@/hooks/useChatHistory';
import { streamChatResponse } from '@/services/chatService';

export function ChatPanel() {
  const { messages, addMessage, updateLastMessage, clearHistory } =
    useChatHistory();
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Auto-scroll to bottom when new messages arrive
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Handle sending a new message
   */
  const handleSendMessage = async (content: string) => {
    // Add user message
    addMessage({ role: 'user', content });

    // Prepare to receive assistant response
    setIsStreaming(true);

    // Add placeholder for assistant message
    addMessage({ role: 'assistant', content: '' });

    let assistantContent = '';
    let reasoningContent = '';

    try {
      await streamChatResponse(
        [...messages, { role: 'user', content }],
        (chunk) => {
          // Update reasoning content
          if (chunk.reasoning) {
            reasoningContent += chunk.reasoning;
          }

          // Update main content
          if (chunk.content) {
            assistantContent += chunk.content;
          }

          // Update the last message (assistant) with accumulated content
          updateLastMessage(assistantContent, reasoningContent || undefined);
        }
      );
    } catch (error) {
      // Handle error by updating the last message
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      updateLastMessage(`错误: ${errorMessage}`);
    } finally {
      setIsStreaming(false);
    }
  };

  /**
   * Handle clear chat history
   */
  const handleClearChat = () => {
    clearHistory();
  };

  return (
    <div className="w-[380px] flex-shrink-0 flex flex-col h-[calc(100vh-120px)] sticky top-6">
      <div className="flex-1 flex flex-col overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-5 shadow-sm">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[var(--border-color)] mb-3">
          <span className="text-[var(--text-primary)] font-medium text-[15px]">
            LLM 助手
          </span>
          <button
            onClick={handleClearChat}
            className="
              px-2.5 py-1.5 text-[12px]
              rounded-lg
              bg-[var(--bg-button)] text-[var(--text-primary)]
              border border-[var(--border-color)]
              transition-all duration-300
              hover:bg-[var(--highlight-color)] hover:text-white
            "
          >
            清空对话
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-3">
          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
      </div>
    </div>
  );
}
