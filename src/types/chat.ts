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

// ============================================
// Podcast Rough Cut Analysis Types
// ============================================

/**
 * 段落结构项
 */
export interface ParagraphStructure {
  /** 段落序号（从1开始） */
  index: number;
  /** 主题概括 */
  theme: string;
  /** 时间范围（如 "00:30-02:15"） */
  timeRange?: string;
}

/**
 * 结构问题类型
 */
export type StructureIssueType =
  | 'verbose'
  | 'unclear'
  | 'repetitive'
  | 'off-topic'
  | 'filler';

/**
 * 结构问题
 */
export interface StructureIssue {
  /** 问题类型 */
  type: StructureIssueType;
  /** 问题描述 */
  description: string;
  /** 位置描述 */
  location: string;
}

/**
 * 删除建议类型
 */
export type DeletionType = 'verbose' | 'repetitive' | 'filler' | 'off-topic';

/**
 * 删除优先级
 */
export type DeletionPriority = 'high' | 'medium' | 'low';

/**
 * 删除建议项
 */
export interface DeletionSuggestion {
  /** 要删除的文本（用于精确匹配） */
  text: string;
  /** 删除原因 */
  reason: string;
  /** 删除类型 */
  type: DeletionType;
  /** 建议优先级 */
  priority: DeletionPriority;
}

/**
 * 播客粗剪分析结果
 */
export interface PodcastRoughCutResult {
  /** 段落结构 */
  structure: ParagraphStructure[];
  /** 结构问题 */
  issues: StructureIssue[];
  /** 删除建议 */
  deletions: DeletionSuggestion[];
}
