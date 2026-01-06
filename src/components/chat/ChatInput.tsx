/**
 * Chat Input Component - Textarea with send button and loading state
 * Shift+Enter for newline, Enter to send
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Auto-adjust textarea height based on content
   */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  /**
   * Handle send button click
   */
  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  /**
   * Handle keyboard events
   * Enter: send, Shift+Enter: newline
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 pt-3 border-t border-[var(--border-color)] mt-auto">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息..."
        rows={1}
        disabled={disabled}
        className="
          flex-1 px-3 py-2.5 rounded-[10px]
          border border-[var(--border-input)]
          bg-[var(--bg-input)] text-[var(--text-primary)]
          resize-none min-h-[40px] max-h-[120px]
          font-inherit text-[14px]
          transition-all duration-300
          focus:outline-none focus:border-[var(--highlight-color)]
          disabled:opacity-60 disabled:cursor-not-allowed
        "
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={`
          px-4 py-2.5 whitespace-nowrap
          rounded-[10px]
          bg-[var(--bg-button)] text-[var(--text-primary)]
          border border-[var(--border-color)]
          transition-all duration-300
          hover:bg-[var(--highlight-color)] hover:text-white
          disabled:opacity-60 disabled:cursor-not-allowed
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {disabled ? '发送中...' : '发送'}
      </button>
    </div>
  );
}
