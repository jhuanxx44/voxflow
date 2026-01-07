/**
 * Chat Message Component - Displays a single chat message bubble
 * Supports user/assistant roles, markdown rendering, and thinking animation
 */

import type {
  ChatMessage as ChatMessageType,
  FillerWord,
  TextReplacement,
  PodcastRoughCutResult,
} from '@/types';
import ReactMarkdown from 'react-markdown';
import { FillerAnalysis } from './FillerAnalysis';
import { PolishAnalysis } from './PolishAnalysis';
import { PodcastRoughCutAnalysis } from './PodcastRoughCutAnalysis';

interface ChatMessageProps {
  message: ChatMessageType;
  isThinking?: boolean; // 是否正在思考（有 reasoning 但没有 content）
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

/**
 * Parse filler data from message content
 * Extracts JSON from <filler_data> tags and returns both text and parsed fillers
 */
function parseFillerData(content: string): {
  text: string;
  fillers: FillerWord[] | null;
} {
  const match = content.match(/<filler_data>([\s\S]*?)<\/filler_data>/);
  if (!match) {
    return { text: content, fillers: null };
  }

  try {
    const json = JSON.parse(match[1].trim());
    // Remove filler_data tag from display text
    const textWithoutTag = content
      .replace(/<filler_data>[\s\S]*?<\/filler_data>/, '')
      .trim();
    return { text: textWithoutTag, fillers: json.fillers || [] };
  } catch {
    // If JSON parsing fails, return original content
    return { text: content, fillers: null };
  }
}

/**
 * Parse polish data from message content
 * Extracts JSON from <polish_data> tags and returns both text and parsed replacements
 */
function parsePolishData(content: string): {
  text: string;
  replacements: TextReplacement[] | null;
} {
  const match = content.match(/<polish_data>([\s\S]*?)<\/polish_data>/);
  if (!match) {
    return { text: content, replacements: null };
  }

  try {
    const json = JSON.parse(match[1].trim());
    // Remove polish_data tag from display text
    const textWithoutTag = content
      .replace(/<polish_data>[\s\S]*?<\/polish_data>/, '')
      .trim();
    return { text: textWithoutTag, replacements: json.replacements || [] };
  } catch {
    // If JSON parsing fails, return original content
    return { text: content, replacements: null };
  }
}

/**
 * Parse podcast rough cut data from message content
 * Extracts JSON from <rough_cut_data> tags and returns both text and parsed result
 */
function parsePodcastRoughCutData(content: string): {
  text: string;
  roughCutData: PodcastRoughCutResult | null;
} {
  const match = content.match(/<rough_cut_data>([\s\S]*?)<\/rough_cut_data>/);
  if (!match) {
    return { text: content, roughCutData: null };
  }

  try {
    const json = JSON.parse(match[1].trim()) as PodcastRoughCutResult;
    // Remove rough_cut_data tag from display text
    const textWithoutTag = content
      .replace(/<rough_cut_data>[\s\S]*?<\/rough_cut_data>/, '')
      .trim();
    return { text: textWithoutTag, roughCutData: json };
  } catch {
    // If JSON parsing fails, return original content
    return { text: content, roughCutData: null };
  }
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

  // 用户消息：简单显示
  if (role === 'user') {
    return (
      <div className="self-end px-3 py-2.5 rounded-[10px] rounded-br-[4px] max-w-[90%] break-words leading-[1.5] text-[14px] bg-[var(--highlight-color)] text-white">
        {content}
      </div>
    );
  }

  // 助手消息：解析口癖数据、润色数据和播客粗剪数据，然后渲染 Markdown
  const { text: afterFiller, fillers } = parseFillerData(content);
  const { text: afterPolish, replacements } = parsePolishData(afterFiller);
  const { text: displayText, roughCutData } = parsePodcastRoughCutData(afterPolish);

  return (
    <div className="self-start px-3 py-2.5 rounded-[10px] rounded-bl-[4px] max-w-[90%] break-words text-[14px] bg-[var(--bg-button)] text-[var(--text-primary)] markdown-content">
      <ReactMarkdown
        components={{
          // 自定义代码块样式
          code: ({ node, className, children, ...props }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1 py-0.5 rounded bg-[var(--bg-text-area)] text-[13px] font-mono" {...props}>
                {children}
              </code>
            ) : (
              <code className="block p-2 rounded bg-[var(--bg-text-area)] text-[13px] font-mono overflow-x-auto my-2" {...props}>
                {children}
              </code>
            );
          },
          // 段落
          p: ({ children }) => <p className="my-1 leading-[1.6]">{children}</p>,
          // 列表
          ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-[1.5]">{children}</li>,
          // 标题
          h1: ({ children }) => <h1 className="text-lg font-bold my-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold my-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold my-1">{children}</h3>,
          // 强调
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          // 链接
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--highlight-color)] underline">
              {children}
            </a>
          ),
          // 引用块
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--border-color)] pl-3 my-2 text-[var(--text-muted)]">
              {children}
            </blockquote>
          ),
        }}
      >
        {displayText}
      </ReactMarkdown>
      {fillers && fillers.length > 0 && <FillerAnalysis fillers={fillers} />}
      {replacements && replacements.length > 0 && (
        <PolishAnalysis replacements={replacements} />
      )}
      {roughCutData && <PodcastRoughCutAnalysis data={roughCutData} />}
    </div>
  );
}
