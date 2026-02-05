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
 * 修改建议优先级
 */
export type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * 修改建议动作类型
 */
export type SuggestionAction = 'delete' | 'regenerate';

/**
 * 修改建议项
 */
export interface EditSuggestion {
  /** 要修改的文本（用于精确匹配） */
  text: string;
  /** 修改原因 */
  reason: string;
  /** 建议动作：delete(删除) | regenerate(TTS重新生成) */
  action: SuggestionAction;
  /** 建议优先级 */
  priority: SuggestionPriority;
}

/**
 * 播客粗剪分析结果
 */
export interface PodcastRoughCutResult {
  /** 段落结构 */
  structure: ParagraphStructure[];
  /** 结构问题 */
  issues: StructureIssue[];
  /** 修改建议 */
  suggestions: EditSuggestion[];
}

// 兼容旧类型（保持向后兼容）
/** @deprecated 使用 SuggestionPriority */
export type DeletionPriority = SuggestionPriority;
/** @deprecated 使用 EditSuggestion */
export type DeletionSuggestion = EditSuggestion;
/** @deprecated 使用 SuggestionAction */
export type DeletionType = 'verbose' | 'repetitive' | 'filler' | 'off-topic';

// ============================================
// Cover Generation Types
// ============================================

/**
 * 封面风格选项
 */
export type CoverStyle =
  | '日式动画'
  | '3D 动画'
  | '像素风格'
  | '吉卜力'
  | '美式漫画';

/**
 * 封面生成提示词数据（LLM 返回）
 */
export interface CoverPromptData {
  /** 内容概括（中文） */
  summary: string;
  /** 图像生成提示词（英文） */
  prompt: string;
  /** 视觉关键词 */
  keywords: string[];
}
