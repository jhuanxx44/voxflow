/**
 * FillerAnalysis Component - Renders filler word analysis results
 * with checkboxes for user selection and batch delete functionality
 */

import { useState } from 'react';
import type { FillerWord } from '@/types';
import { useEditorStore } from '@/stores/editorStore';

interface FillerAnalysisProps {
  fillers: FillerWord[];
}

export function FillerAnalysis({ fillers }: FillerAnalysisProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletedItems, setDeletedItems] = useState<Set<string>>(new Set());
  const deleteByText = useEditorStore((s) => s.deleteByText);

  // Filter out already deleted items
  const remainingFillers = fillers.filter((f) => !deletedItems.has(f.text));

  /**
   * Toggle selection of a filler word
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
   * Select or deselect all remaining filler words
   */
  const handleSelectAll = () => {
    if (selected.size === remainingFillers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(remainingFillers.map((f) => f.text)));
    }
  };

  /**
   * Delete all selected filler words
   */
  const handleDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selected.size} 种口癖词吗？`)) return;

    // Delete each selected filler word
    Array.from(selected).forEach((text) => {
      deleteByText(text);
    });

    // Mark items as deleted and clear selection
    setDeletedItems(new Set([...deletedItems, ...selected]));
    setSelected(new Set());
  };

  // Show completion state when all items are deleted
  if (remainingFillers.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
        ✓ 已完成删除
      </div>
    );
  }

  // Show empty state if no fillers found
  if (fillers.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-[var(--bg-text-area)] border border-[var(--border-color)] text-[var(--text-muted)] text-sm">
        未发现口癖词
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-[var(--bg-text-area)] border border-[var(--border-color)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--text-muted)]">
          选择要删除的口癖词：
        </span>
        <button
          onClick={handleSelectAll}
          className="text-xs text-[var(--highlight-color)] hover:underline"
        >
          {selected.size === remainingFillers.length ? '取消全选' : '全选'}
        </button>
      </div>

      <div className="space-y-1.5">
        {remainingFillers.map((filler) => (
          <label
            key={filler.text}
            className="flex items-center gap-2 cursor-pointer hover:bg-[var(--bg-button)] p-1.5 rounded transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(filler.text)}
              onChange={() => handleToggle(filler.text)}
              className="w-4 h-4 accent-[var(--highlight-color)]"
            />
            <span className="font-medium">{filler.text}</span>
            <span className="text-[var(--text-muted)] text-sm">
              ({filler.count}次)
            </span>
          </label>
        ))}
      </div>

      <button
        onClick={handleDelete}
        disabled={selected.size === 0}
        className="
          mt-3 w-full py-2 rounded-lg text-sm font-medium
          bg-red-500/20 text-red-400 border border-red-500/30
          hover:bg-red-500 hover:text-white hover:border-red-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
        "
      >
        确认删除 ({selected.size})
      </button>
    </div>
  );
}
