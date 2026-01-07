/**
 * PodcastRoughCutAnalysis Component - Renders podcast rough cut analysis results
 * with structure overview, issues list, and deletion suggestions with checkboxes
 */

import { useState } from 'react';
import type {
  PodcastRoughCutResult,
  DeletionSuggestion,
  StructureIssue,
  DeletionPriority,
} from '@/types';
import { useEditorStore } from '@/stores/editorStore';

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
const PRIORITY_COLORS: Record<DeletionPriority, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-green-400',
};

/** 优先级图标映射 */
const PRIORITY_ICONS: Record<DeletionPriority, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

/** 优先级标签映射 */
const PRIORITY_LABELS: Record<DeletionPriority, string> = {
  high: '强烈建议',
  medium: '建议',
  low: '可选',
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
  const { structure, issues, deletions } = data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletedItems, setDeletedItems] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<DeletionPriority | 'all'>('all');
  const deleteByText = useEditorStore((s) => s.deleteByText);

  // Filter out already deleted items
  const remainingDeletions = deletions.filter((d) => !deletedItems.has(d.text));

  // Apply priority filter
  const filteredDeletions = priorityFilter === 'all'
    ? remainingDeletions
    : remainingDeletions.filter((d) => d.priority === priorityFilter);

  /**
   * Toggle selection of a deletion suggestion
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
   * Select all filtered deletions
   */
  const handleSelectAll = () => {
    const filteredTexts = filteredDeletions.map((d) => d.text);
    const allSelected = filteredTexts.every((t) => selected.has(t));

    if (allSelected) {
      // Deselect all filtered items
      const newSelected = new Set(selected);
      filteredTexts.forEach((t) => newSelected.delete(t));
      setSelected(newSelected);
    } else {
      // Select all filtered items
      setSelected(new Set([...selected, ...filteredTexts]));
    }
  };

  /**
   * Select only high priority items
   */
  const handleSelectHighPriority = () => {
    const highPriorityTexts = remainingDeletions
      .filter((d) => d.priority === 'high')
      .map((d) => d.text);
    setSelected(new Set(highPriorityTexts));
  };

  /**
   * Delete all selected items
   */
  const handleDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selected.size} 项内容吗？\n\n这些句子将从识别结果中移除。`)) return;

    // Delete each selected item
    Array.from(selected).forEach((text) => {
      deleteByText(text);
    });

    // Mark items as deleted and clear selection
    setDeletedItems(new Set([...deletedItems, ...selected]));
    setSelected(new Set());
  };

  // Count items by priority
  const priorityCounts = {
    high: remainingDeletions.filter((d) => d.priority === 'high').length,
    medium: remainingDeletions.filter((d) => d.priority === 'medium').length,
    low: remainingDeletions.filter((d) => d.priority === 'low').length,
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

      {/* Deletion Suggestions */}
      {deletions.length > 0 && (
        <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
          <div className="p-2.5 bg-[var(--bg-button)]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span>🗑️</span>
                <span>删除建议</span>
                <span className="text-[var(--text-muted)]">
                  ({remainingDeletions.length})
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
                全部 ({remainingDeletions.length})
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
                {filteredDeletions.every((d) => selected.has(d.text)) && filteredDeletions.length > 0
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

          {/* Deletion list */}
          {remainingDeletions.length > 0 ? (
            <div className="p-2.5 bg-[var(--bg-text-area)] space-y-2">
              {filteredDeletions.map((deletion, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-2 cursor-pointer hover:bg-[var(--bg-button)] p-2 rounded transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(deletion.text)}
                    onChange={() => handleToggle(deletion.text)}
                    className="w-4 h-4 mt-0.5 accent-[var(--highlight-color)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span>{PRIORITY_ICONS[deletion.priority]}</span>
                      <span className="text-sm break-all">"{deletion.text}"</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <span className={PRIORITY_COLORS[deletion.priority]}>
                        {PRIORITY_LABELS[deletion.priority]}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-muted)]">
                        {ISSUE_TYPE_ICONS[deletion.type] || '📌'} {ISSUE_TYPE_LABELS[deletion.type] || deletion.type}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-secondary)]">
                        {deletion.reason}
                      </span>
                    </div>
                  </div>
                </label>
              ))}

              {/* Delete button */}
              <button
                onClick={handleDelete}
                disabled={selected.size === 0}
                className="
                  mt-2 w-full py-2 rounded-lg text-sm font-medium
                  bg-red-500/20 text-red-400 border border-red-500/30
                  hover:bg-red-500 hover:text-white hover:border-red-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              >
                确认删除选中的 {selected.size} 项
              </button>
            </div>
          ) : (
            <div className="p-3 bg-green-500/10 border-t border-green-500/30 text-green-400 text-sm text-center">
              ✓ 已完成所有删除
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {structure.length === 0 && issues.length === 0 && deletions.length === 0 && (
        <div className="p-3 rounded-lg bg-[var(--bg-text-area)] border border-[var(--border-color)] text-[var(--text-muted)] text-sm text-center">
          未发现需要处理的内容
        </div>
      )}
    </div>
  );
}
