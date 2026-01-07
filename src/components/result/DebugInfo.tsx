/**
 * DebugInfo - Debug information display component
 *
 * Shows internal state information useful for debugging:
 * - Composition array
 * - Character composition array
 * - Smart paragraph groups
 * - Edit mode state
 * - Playback state
 */

import React from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';

export const DebugInfo: React.FC = () => {
  const {
    composition,
    charComposition,
    smartParagraphGroups,
    isCharEditMode,
    displayMode,
    hasEdited,
    isSmartParagraphManuallyEdited,
    editedPlaying,
    editedPlayPos,
  } = useEditorStore();

  const { debugVisible } = useUIStore();

  if (!debugVisible) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-4">
      <h2 className="mb-4 text-lg font-semibold">调试信息</h2>

      <div className="space-y-3 font-mono text-xs">
        {/* Display mode */}
        <div>
          <span className="text-[var(--text-muted)]">显示模式: </span>
          <span className="text-[var(--text-primary)]">{displayMode}</span>
        </div>

        {/* Edit mode */}
        <div>
          <span className="text-[var(--text-muted)]">编辑模式: </span>
          <span className="text-[var(--text-primary)]">
            {isCharEditMode ? '逐字编辑' : '段落编辑'}
          </span>
        </div>

        {/* Edit state */}
        <div>
          <span className="text-[var(--text-muted)]">是否已编辑: </span>
          <span className="text-[var(--text-primary)]">{hasEdited ? '是' : '否'}</span>
        </div>

        {/* Smart paragraph manually edited */}
        {displayMode === 'smart-paragraph' && (
          <div>
            <span className="text-[var(--text-muted)]">智能分段手动编辑: </span>
            <span className="text-[var(--text-primary)]">
              {isSmartParagraphManuallyEdited ? '是' : '否'}
            </span>
          </div>
        )}

        {/* Playback state */}
        <div>
          <span className="text-[var(--text-muted)]">编辑播放: </span>
          <span className="text-[var(--text-primary)]">
            {editedPlaying ? `播放中 (位置: ${editedPlayPos})` : '未播放'}
          </span>
        </div>

        {/* Composition array */}
        <div>
          <div className="mb-1 text-[var(--text-muted)]">Composition 数组:</div>
          <div className="max-h-20 overflow-auto rounded bg-[var(--bg-segment)] p-2 text-[var(--text-secondary)]">
            [{composition.join(', ')}]
          </div>
        </div>

        {/* Character composition array */}
        {isCharEditMode && charComposition.length > 0 && (
          <div>
            <div className="mb-1 text-[var(--text-muted)]">CharComposition 数组:</div>
            <div className="max-h-20 overflow-auto rounded bg-[var(--bg-segment)] p-2 text-[var(--text-secondary)]">
              [{charComposition.slice(0, 100).join(', ')}
              {charComposition.length > 100 && '...'}]
            </div>
          </div>
        )}

        {/* Smart paragraph groups */}
        {displayMode === 'smart-paragraph' && smartParagraphGroups.length > 0 && (
          <div>
            <div className="mb-1 text-[var(--text-muted)]">智能分段分组:</div>
            <div className="max-h-32 overflow-auto rounded bg-[var(--bg-segment)] p-2 text-[var(--text-secondary)]">
              {smartParagraphGroups.map((group, idx) => (
                <div key={idx}>
                  段落 {idx + 1}: [{group.join(', ')}]
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Composition stats */}
        <div>
          <span className="text-[var(--text-muted)]">统计: </span>
          <span className="text-[var(--text-primary)]">
            {isCharEditMode
              ? `${charComposition.length} 个字符`
              : `${composition.length} 个段落`}
          </span>
        </div>
      </div>
    </div>
  );
};
