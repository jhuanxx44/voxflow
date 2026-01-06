/**
 * Chat Input Component - Textarea with send button and loading state
 * Shift+Enter for newline, Enter to send
 * Includes quick command bubbles above the input
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface QuickCommand {
  label: string;
  message: string;
}

// 快捷命令列表
const QUICK_COMMANDS: QuickCommand[] = [
  { label: '概括ASR结果', message: '请概括一下这段语音识别的内容，提取主要观点和关键信息。' },
  { label: '翻译为英文', message: '请将这段语音识别的内容翻译成英文。' },
  { label: '快速删除口癖', message: '[FILLER_ANALYSIS]请分析这段语音识别结果中的口癖词' },
];

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  hasASRResult?: boolean; // 是否有 ASR 结果
}

export function ChatInput({ onSend, disabled = false, hasASRResult = false }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Handle quick command click
   */
  const handleQuickCommand = (command: QuickCommand) => {
    if (disabled) return;
    onSend(command.message);
  };

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
   * Note: Check isComposing to avoid triggering send during IME composition
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 检查是否正在使用输入法组合（如中文拼音输入）
    // isComposing 为 true 时，回车键应该用于确认输入法的选择，而不是发送消息
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="pt-3 border-t border-[var(--border-color)] mt-auto">
      {/* Quick command bubbles */}
      {hasASRResult && (
        <div className="flex flex-wrap gap-2 mb-2">
          {QUICK_COMMANDS.map((cmd, index) => (
            <button
              key={index}
              onClick={() => handleQuickCommand(cmd)}
              disabled={disabled}
              className="
                px-3 py-1.5 text-[12px]
                rounded-full
                bg-[var(--bg-chip)] text-[var(--text-secondary)]
                border border-[var(--border-color)]
                transition-all duration-200
                hover:bg-[var(--highlight-color)] hover:text-white hover:border-[var(--highlight-color)]
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {cmd.label}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2">
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
    </div>
  );
}
