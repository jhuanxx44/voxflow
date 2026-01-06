/**
 * PolishAnalysis Component - Renders text replacement suggestions
 * with checkboxes for user selection and batch replace functionality
 */

import { useState } from 'react';
import type { TextReplacement } from '@/types';
import { useEditorStore } from '@/stores/editorStore';

interface PolishAnalysisProps {
  replacements: TextReplacement[];
}

export function PolishAnalysis({ replacements }: PolishAnalysisProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [appliedItems, setAppliedItems] = useState<Set<string>>(new Set());
  const replaceText = useEditorStore((s) => s.replaceText);

  // Filter out already applied replacements
  const remainingReplacements = replacements.filter(
    (r) => !appliedItems.has(r.old)
  );

  /**
   * Toggle selection of a replacement
   */
  const handleToggle = (oldText: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(oldText)) {
      newSelected.delete(oldText);
    } else {
      newSelected.add(oldText);
    }
    setSelected(newSelected);
  };

  /**
   * Select or deselect all remaining replacements
   */
  const handleSelectAll = () => {
    if (selected.size === remainingReplacements.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(remainingReplacements.map((r) => r.old)));
    }
  };

  /**
   * Apply selected replacements
   */
  const handleApply = () => {
    if (selected.size === 0) return;
    if (!confirm(`确定要应用选中的 ${selected.size} 项替换吗？`)) return;

    console.log('[PolishAnalysis] Applying replacements:', {
      selected: Array.from(selected),
      replacements,
    });

    // Execute replacements
    replacements.forEach((r) => {
      if (selected.has(r.old)) {
        console.log('[PolishAnalysis] Calling replaceText:', { old: r.old, new: r.new });
        replaceText(r.old, r.new);
      }
    });

    // Mark items as applied and clear selection
    setAppliedItems(new Set([...appliedItems, ...selected]));
    setSelected(new Set());
  };

  // Show completion state when all items are applied
  if (remainingReplacements.length === 0 && appliedItems.size > 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
        ✓ 已完成润色
      </div>
    );
  }

  // Show empty state if no replacements found
  if (replacements.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-[var(--bg-text-area)] border border-[var(--border-color)] text-[var(--text-muted)] text-sm">
        未发现需要修正的内容
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-[var(--bg-text-area)] border border-[var(--border-color)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--text-muted)]">
          选择要应用的修正：
        </span>
        <button
          onClick={handleSelectAll}
          className="text-xs text-[var(--highlight-color)] hover:underline"
        >
          {selected.size === remainingReplacements.length ? '取消全选' : '全选'}
        </button>
      </div>

      <div className="space-y-2">
        {remainingReplacements.map((replacement) => (
          <label
            key={replacement.old}
            className="flex items-start gap-2 cursor-pointer hover:bg-[var(--bg-button)] p-2 rounded transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(replacement.old)}
              onChange={() => handleToggle(replacement.old)}
              className="w-4 h-4 mt-0.5 accent-[var(--highlight-color)]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="line-through text-red-400">
                  {replacement.old}
                </span>
                <span className="text-[var(--text-muted)]">→</span>
                <span className="text-green-400 font-medium">
                  {replacement.new}
                </span>
                <span className="text-[var(--text-muted)] text-xs">
                  ({replacement.count}次)
                </span>
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {replacement.reason}
                {replacement.old.length !== replacement.new.length && (
                  <span className="text-yellow-500 ml-2">⚠ 字数不同</span>
                )}
              </div>
            </div>
          </label>
        ))}
      </div>

      <button
        onClick={handleApply}
        disabled={selected.size === 0}
        className="
          mt-3 w-full py-2 rounded-lg text-sm font-medium
          bg-blue-500/20 text-blue-400 border border-blue-500/30
          hover:bg-blue-500 hover:text-white hover:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
        "
      >
        确认替换 ({selected.size})
      </button>
    </div>
  );
}
