/**
 * PodcastRoughCutAnalysis Component - Renders podcast rough cut analysis results
 * with structure overview, issues list, and edit suggestions with action buttons
 */

import { useState } from 'react';
import type {
  PodcastRoughCutResult,
  SuggestionPriority,
  SuggestionAction,
} from '@/types';
import { useEditorStore } from '@/stores/editorStore';
import { useTTSRegenerate } from '@/hooks/useTTSRegenerate';

interface PodcastRoughCutAnalysisProps {
  data: PodcastRoughCutResult;
}

/** 问题类型图标映射 */
const ISSUE_TYPE_ICONS: Record<string, string> = {
  verbose: '📝',
  unclear: '❓',
  repetitive: '🔁',
  'off-topic': '🚫',
  filler: '💬',
};

/** 问题类型中文映射 */
const ISSUE_TYPE_LABELS: Record<string, string> = {
  verbose: '啰嗦',
  unclear: '不清楚',
  repetitive: '重复',
  'off-topic': '跑题',
  filler: '填充词',
};

/** 优先级颜色映射 */
const PRIORITY_COLORS: Record<SuggestionPriority, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-green-400',
};

/** 优先级图标映射 */
const PRIORITY_ICONS: Record<SuggestionPriority, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

/** 优先级标签映射 */
const PRIORITY_LABELS: Record<SuggestionPriority, string> = {
  high: '强烈建议',
  medium: '建议',
  low: '可选',
};

/** 动作图标映射 */
const ACTION_ICONS: Record<SuggestionAction, string> = {
  delete: '🗑️',
  regenerate: '🔄',
};

/** 动作标签映射 */
const ACTION_LABELS: Record<SuggestionAction, string> = {
  delete: '删除',
  regenerate: 'TTS重生成',
};

/**
 * Collapsible section component
 */
function CollapsibleSection({
  title,
  icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2.5 bg-[var(--bg-button)] hover:bg-[var(--bg-chip)] transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span>{icon}</span>
          <span>{title}</span>
          {count !== undefined && (
            <span className="text-[var(--text-muted)]">({count})</span>
          )}
        </span>
        <span className="text-[var(--text-muted)]">{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && (
        <div className="p-2.5 bg-[var(--bg-text-area)]">{children}</div>
      )}
    </div>
  );
}

export function PodcastRoughCutAnalysis({ data }: PodcastRoughCutAnalysisProps) {
  const { structure, issues, suggestions } = data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processedItems, setProcessedItems] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<SuggestionPriority | 'all'>('all');
  const deleteByText = useEditorStore((s) => s.deleteByText);
  const { regenerateByText, isRegenerating, progress: ttsProgress } = useTTSRegenerate();
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  // Filter out already processed items
  const remainingSuggestions = suggestions.filter((s) => !processedItems.has(s.text));

  // Apply priority filter
  const filteredSuggestions = priorityFilter === 'all'
    ? remainingSuggestions
    : remainingSuggestions.filter((s) => s.priority === priorityFilter);

  /**
   * Toggle selection of a suggestion
   */
  const handleToggle = (text: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(text)) {
      newSelected.delete(text);
    } else {
      newSelected.add(text);
    }
    setSelected(newSelected);
  };

  /**
   * Select all filtered suggestions
   */
  const handleSelectAll = () => {
    const filteredTexts = filteredSuggestions.map((s) => s.text);
    const allSelected = filteredTexts.every((t) => selected.has(t));

    if (allSelected) {
      const newSelected = new Set(selected);
      filteredTexts.forEach((t) => newSelected.delete(t));
      setSelected(newSelected);
    } else {
      setSelected(new Set([...selected, ...filteredTexts]));
    }
  };

  /**
   * Select only high priority items
   */
  const handleSelectHighPriority = () => {
    const highPriorityTexts = remainingSuggestions
      .filter((s) => s.priority === 'high')
      .map((s) => s.text);
    setSelected(new Set(highPriorityTexts));
  };

  /**
   * Get selected suggestions
   */
  const getSelectedSuggestions = () => {
    return suggestions.filter((s) => selected.has(s.text));
  };

  /**
   * Execute delete action
   */
  const handleDelete = () => {
    const toDelete = getSelectedSuggestions().filter((s) => s.action === 'delete');
    if (toDelete.length === 0) return;
    if (!confirm(`确定要删除选中的 ${toDelete.length} 项内容吗？\n\n这些句子将从识别结果中移除。`)) return;

    toDelete.forEach((item) => {
      deleteByText(item.text);
    });

    setProcessedItems(new Set([...processedItems, ...toDelete.map((s) => s.text)]));
    setSelected(new Set([...selected].filter((t) => !toDelete.some((s) => s.text === t))));
  };

  /**
   * Execute TTS regenerate action with voice cloning
   */
  const handleRegenerate = async () => {
    const toRegenerate = getSelectedSuggestions().filter((s) => s.action === 'regenerate');
    if (toRegenerate.length === 0) return;

    if (!confirm(`确定要对选中的 ${toRegenerate.length} 项内容进行 TTS 重生成吗？\n\n将使用原始说话人声音进行语音克隆。`)) return;

    setRegenerateError(null);

    try {
      for (let i = 0; i < toRegenerate.length; i++) {
        await regenerateByText(toRegenerate[i].text);
      }

      // Mark as processed and clear selection
      setProcessedItems(new Set([...processedItems, ...toRegenerate.map((s) => s.text)]));
      setSelected(new Set([...selected].filter((t) => !toRegenerate.some((s) => s.text === t))));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setRegenerateError(msg);
      console.error('[TTS Regenerate]', msg);
    }
  };

  // Count items by priority
  const priorityCounts = {
    high: remainingSuggestions.filter((s) => s.priority === 'high').length,
    medium: remainingSuggestions.filter((s) => s.priority === 'medium').length,
    low: remainingSuggestions.filter((s) => s.priority === 'low').length,
  };

  // Count selected items by action type
  const selectedByAction = {
    delete: getSelectedSuggestions().filter((s) => s.action === 'delete').length,
    regenerate: getSelectedSuggestions().filter((s) => s.action === 'regenerate').length,
  };

  return (
    <div className="mt-3 space-y-3">
      {/* Structure Overview */}
      {structure.length > 0 && (
        <CollapsibleSection
          title="段落结构"
          icon="📋"
          count={structure.length}
          defaultOpen={false}
        >
          <div className="space-y-1.5">
            {structure.map((para) => (
              <div
                key={para.index}
                className="flex items-center gap-2 text-sm"
              >
                <span className="text-[var(--text-muted)]">{para.index}.</span>
                <span className="font-medium">{para.theme}</span>
                {para.timeRange && (
                  <span className="text-[var(--text-muted)] text-xs">
                    ({para.timeRange})
                  </span>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Issues List */}
      {issues.length > 0 && (
        <CollapsibleSection
          title="结构问题"
          icon="⚠️"
          count={issues.length}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {issues.map((issue, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-sm p-2 rounded bg-[var(--bg-button)]"
              >
                <span>{ISSUE_TYPE_ICONS[issue.type] || '📌'}</span>
                <div className="flex-1">
                  <span className="font-medium text-[var(--text-muted)]">
                    {ISSUE_TYPE_LABELS[issue.type] || issue.type}
                  </span>
                  <span className="mx-1">·</span>
                  <span>{issue.location}</span>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    {issue.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Edit Suggestions */}
      {suggestions.length > 0 && (
        <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
          <div className="p-2.5 bg-[var(--bg-button)]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span>✏️</span>
                <span>修改建议</span>
                <span className="text-[var(--text-muted)]">
                  ({remainingSuggestions.length})
                </span>
              </span>
            </div>

            {/* Priority filter buttons */}
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => setPriorityFilter('all')}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                  priorityFilter === 'all'
                    ? 'bg-[var(--highlight-color)] text-white border-[var(--highlight-color)]'
                    : 'bg-transparent text-[var(--text-muted)] border-[var(--border-color)] hover:border-[var(--highlight-color)]'
                }`}
              >
                全部 ({remainingSuggestions.length})
              </button>
              {priorityCounts.high > 0 && (
                <button
                  onClick={() => setPriorityFilter('high')}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    priorityFilter === 'high'
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-transparent text-red-400 border-red-400/50 hover:border-red-400'
                  }`}
                >
                  🔴 强烈建议 ({priorityCounts.high})
                </button>
              )}
              {priorityCounts.medium > 0 && (
                <button
                  onClick={() => setPriorityFilter('medium')}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    priorityFilter === 'medium'
                      ? 'bg-yellow-500 text-white border-yellow-500'
                      : 'bg-transparent text-yellow-400 border-yellow-400/50 hover:border-yellow-400'
                  }`}
                >
                  🟡 建议 ({priorityCounts.medium})
                </button>
              )}
              {priorityCounts.low > 0 && (
                <button
                  onClick={() => setPriorityFilter('low')}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    priorityFilter === 'low'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-transparent text-green-400 border-green-400/50 hover:border-green-400'
                  }`}
                >
                  🟢 可选 ({priorityCounts.low})
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSelectAll}
                className="text-xs text-[var(--highlight-color)] hover:underline"
              >
                {filteredSuggestions.every((s) => selected.has(s.text)) && filteredSuggestions.length > 0
                  ? '取消全选'
                  : '全选当前'}
              </button>
              {priorityCounts.high > 0 && (
                <button
                  onClick={handleSelectHighPriority}
                  className="text-xs text-red-400 hover:underline"
                >
                  仅选高优先级
                </button>
              )}
            </div>
          </div>

          {/* Suggestions list */}
          {remainingSuggestions.length > 0 ? (
            <div className="p-2.5 bg-[var(--bg-text-area)] space-y-2">
              {filteredSuggestions.map((suggestion, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-2 cursor-pointer hover:bg-[var(--bg-button)] p-2 rounded transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(suggestion.text)}
                    onChange={() => handleToggle(suggestion.text)}
                    className="w-4 h-4 mt-0.5 accent-[var(--highlight-color)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span>{PRIORITY_ICONS[suggestion.priority]}</span>
                      <span className="text-sm break-all">"{suggestion.text}"</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                      <span className={PRIORITY_COLORS[suggestion.priority]}>
                        {PRIORITY_LABELS[suggestion.priority]}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className={suggestion.action === 'regenerate' ? 'text-blue-400' : 'text-[var(--text-muted)]'}>
                        {ACTION_ICONS[suggestion.action]} {ACTION_LABELS[suggestion.action]}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-secondary)]">
                        {suggestion.reason}
                      </span>
                    </div>
                  </div>
                </label>
              ))}

              {/* Action buttons */}
              <div className="flex gap-2 mt-2">
                {/* Delete button */}
                <button
                  onClick={handleDelete}
                  disabled={selectedByAction.delete === 0}
                  className="
                    flex-1 py-2 rounded-lg text-sm font-medium
                    bg-red-500/20 text-red-400 border border-red-500/30
                    hover:bg-red-500 hover:text-white hover:border-red-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200
                  "
                >
                  🗑️ 删除 ({selectedByAction.delete})
                </button>

                {/* TTS Regenerate button */}
                <button
                  onClick={handleRegenerate}
                  disabled={selectedByAction.regenerate === 0 || isRegenerating}
                  className="
                    flex-1 py-2 rounded-lg text-sm font-medium
                    bg-blue-500/20 text-blue-400 border border-blue-500/30
                    hover:bg-blue-500 hover:text-white hover:border-blue-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200
                  "
                >
                  {isRegenerating
                    ? ttsProgress || '生成中...'
                    : `🔄 TTS重生成 (${selectedByAction.regenerate})`
                  }
                </button>
              </div>

              {/* TTS error message */}
              {regenerateError && (
                <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {regenerateError}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-green-500/10 border-t border-green-500/30 text-green-400 text-sm text-center">
              ✓ 已完成所有修改
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {structure.length === 0 && issues.length === 0 && suggestions.length === 0 && (
        <div className="p-3 rounded-lg bg-[var(--bg-text-area)] border border-[var(--border-color)] text-[var(--text-muted)] text-sm text-center">
          未发现需要处理的内容
        </div>
      )}
    </div>
  );
}
