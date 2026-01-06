/**
 * Chat Message Component - Displays a single chat message bubble
 * Supports user/assistant roles, reasoning blocks, and markdown
 */

import type { ChatMessage as ChatMessageType } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
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

export function ChatMessage({ message }: ChatMessageProps) {
  const { role, content, reasoning } = message;

  return (
    <>
      {/* Reasoning block appears ABOVE the answer */}
      {reasoning && (
        <div className="self-start max-w-[90%] px-3 py-2.5 rounded-[10px] bg-[var(--bg-reasoning)] text-[var(--text-muted)] text-[13px] leading-[1.5] break-words border-l-2 border-[var(--border-input)] ml-2">
          {formatText(reasoning)}
        </div>
      )}

      {/* Main message content */}
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

        {/* Handle code blocks if present */}
        {content.includes('```') && (
          <pre className="bg-[var(--bg-text-area)] p-2 rounded-md overflow-x-auto my-2">
            <code className="font-mono text-[13px]">{content}</code>
          </pre>
        )}
      </div>
    </>
  );
}
