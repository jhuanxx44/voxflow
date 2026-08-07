/**
 * Chat Panel Component - Right-side LLM chat assistant panel
 * Width controlled by parent container (MainLayout), card-style container
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useChatHistory } from '@/hooks/useChatHistory';
import { streamChatResponse } from '@/services/chatService';
import { useEditorStore } from '@/stores/editorStore';

export function ChatPanel() {
  const { messages, addMessage, updateLastMessage, clearHistory } =
    useChatHistory();

  // Get ASR result from editor store
  const { lastFullText, lastSegments, composition, isCharEditMode, charComposition, charLevelData } = useEditorStore();

  /**
   * Build current text based on composition (respects edits like reordering/deletion)
   */
  const currentText = useMemo(() => {
    if (!lastSegments.length) return '';

    const activeComposition = isCharEditMode ? charComposition : composition;
    const activeData = isCharEditMode ? charLevelData : lastSegments;

    return activeComposition
      .map((idx) => {
        const item = activeData[idx];
        if (!item) return '';
        return 'text' in item ? item.text : (item as any).char;
      })
      .join('');
  }, [lastSegments, composition, charComposition, isCharEditMode, charLevelData]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false); // 是否正在思考（有reasoning但没content）
  const messagesContainerRef = useRef<HTMLDivElement>(null); // 消息容器 ref
  const isThinkingRef = useRef(false); // 用 ref 避免闭包问题
  const prevASRTextRef = useRef<string>(''); // 记录上一次的 ASR 文本

  /**
   * 当 ASR 结果变化时（重新识别），清空对话历史
   */
  useEffect(() => {
    // 使用 lastFullText 作为识别结果的标识（原始文本，不受编辑影响）
    if (lastFullText && lastFullText !== prevASRTextRef.current) {
      // ASR 结果变化了，清空对话历史
      if (prevASRTextRef.current !== '') {
        // 只有之前有结果时才清空（避免首次加载时清空）
        console.log('ASR result changed, clearing chat history');
        clearHistory();
      }
      prevASRTextRef.current = lastFullText;
    }
  }, [lastFullText, clearHistory]);

  /**
   * Auto-scroll to bottom when new messages arrive
   * 只滚动对话框容器，不影响整个页面
   */
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
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
    setIsThinking(true);
    isThinkingRef.current = true; // 同步更新 ref

    let assistantContent = '';

    // Build messages with ASR context
    const contextMessages = [...messages, { role: 'user' as const, content }];

    try {
      await streamChatResponse(
        contextMessages,
        currentText, // Pass ASR result as context
        (chunk) => {
          // 收到 content 时，结束思考状态
          if (chunk.content) {
            if (isThinkingRef.current) {
              isThinkingRef.current = false;
              setIsThinking(false);
            }
            assistantContent += chunk.content;
            // Update the last message (assistant) with accumulated content
            updateLastMessage(assistantContent);
          }
          // reasoning 不处理，只用于判断思考状态
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      // Handle error by updating the last message
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      updateLastMessage(`错误: ${errorMessage}`);
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      isThinkingRef.current = false;
    }
  };

  /**
   * Handle clear chat history
   */
  const handleClearChat = () => {
    clearHistory();
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex flex-col overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-5 shadow-sm">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[var(--border-color)] mb-3">
          <span className="text-[var(--text-primary)] font-medium text-[15px]">
            Vox Copilot
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
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto py-2 flex flex-col gap-3"
        >
          {messages.map((message, index) => (
            <ChatMessage
              key={index}
              message={message}
              isThinking={isThinking && index === messages.length - 1}
            />
          ))}
        </div>

        {/* Input area */}
        <ChatInput
          onSend={handleSendMessage}
          disabled={isStreaming}
          hasASRResult={!!currentText}
        />
      </div>
    </div>
  );
}
