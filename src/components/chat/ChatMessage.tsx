/**
 * Chat Message Component - Displays a single chat message bubble
 * Supports user/assistant roles and thinking animation
 */

import type { ChatMessage as ChatMessageType } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
  isThinking?: boolean; // 是否正在思考（有 reasoning 但没有 content）
}

/**
 * Simple markdown-like text formatter
 * Handles basic inline code and preserves line breaks
 */
function formatText(text: string): JSX.Element[] {
  const lines = text.split('\n');
  return lines.map((line, idx) => (
    <span key={idx}>
      {line}
      {idx < lines.length - 1 && <br />}
    </span>
  ));
}

/**
 * Thinking animation component
 */
function ThinkingAnimation() {
  return (
    <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
      <span className="text-[13px]">思考中</span>
      <span className="loading-dots">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
  );
}

export function ChatMessage({ message, isThinking = false }: ChatMessageProps) {
  const { role, content } = message;

  // 如果是助手消息且正在思考（没有内容），显示思考动画
  if (role === 'assistant' && isThinking && !content) {
    return (
      <div className="self-start px-3 py-2.5 rounded-[10px] bg-[var(--bg-button)] text-[var(--text-primary)] rounded-bl-[4px]">
        <ThinkingAnimation />
      </div>
    );
  }

  // 如果是助手消息但内容为空且不在思考，不渲染
  if (role === 'assistant' && !content) {
    return null;
  }

  return (
    <div
      className={`
        px-3 py-2.5 rounded-[10px] max-w-[90%] break-words leading-[1.5] text-[14px]
        ${
          role === 'user'
            ? 'self-end bg-[var(--highlight-color)] text-white rounded-br-[4px]'
            : 'self-start bg-[var(--bg-button)] text-[var(--text-primary)] rounded-bl-[4px]'
        }
      `}
    >
      {formatText(content)}
    </div>
  );
}
