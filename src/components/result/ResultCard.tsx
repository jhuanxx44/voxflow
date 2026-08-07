/**
 * ResultCard - Main recognition result display component
 *
 * Features:
 * - Three display modes: continuous, line-by-line, smart-paragraph
 * - Edit mode toggle (char-level vs segment-level)
 * - Right-click context menu integration
 * - Toolbar buttons (reset, copy, save, etc.)
 * - Integration with playback highlighting
 * - Drag and drop reordering
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useEditorStore, getEffectiveSpeaker } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';
import { useASRStore } from '@/stores/asrStore';
import { SentenceSpan } from './SentenceSpan';
import { ParagraphGroup } from './ParagraphGroup';
import { useComposition } from '@/hooks/useComposition';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useHighlight } from '@/hooks/useHighlight';
import { useEditedPlayback } from '@/hooks/useEditedPlayback';
import { useExport } from '@/hooks/useExport';
import { useTTSRegenerate } from '@/hooks/useTTSRegenerate';
import { groupSegmentsToParagraphs } from '@/utils/paragraphGrouping';
import { getSpeakerColor } from '@/utils/constants';
import { searchTranscript } from '@/services/projectService';
import type { DisplayMode, SearchMatchV1 } from '@/types';

interface ResultCardProps {
  audioRef: React.RefObject<HTMLMediaElement | null>;
}

export const ResultCard: React.FC<ResultCardProps> = ({ audioRef }) => {
  const {
    lastSegments,
    charLevelData,
    composition,
    charComposition,
    isCharEditMode,
    displayMode,
    smartParagraphGroups,
    isSmartParagraphManuallyEdited,
    hasEdited,
    speakerNames,
    speakerMerges,
    setDisplayMode,
    toggleCharEditMode,
    resetEdits,
    undo,
    redo,
    setSmartParagraphGroups,
    deleteMultiplePositions,
    deleteMultipleCharPositions,
    setSpeakerName,
    mergeSpeaker,
    ttsAudioMap,
    ttsGeneratingMap,
    ttsCandidateMap,
    inlineEditIndex,
    setInlineEditIndex,
    projectId,
    revision,
    isCommitting,
    lastError,
    revisionConflict,
  } = useEditorStore();

  // Subscribe to stack lengths for button disabled state
  const canUndo = useEditorStore((s) => s._undoStack.length > 0);
  const canRedo = useEditorStore((s) => s._redoStack.length > 0);

  const { showContextMenu } = useUIStore();
  const mediaType = useASRStore((state) => state.mediaType);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [fillerText, setFillerText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatchV1[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Speaker context menu state
  const [speakerMenu, setSpeakerMenu] = useState<{
    spkId: number;
    x: number;
    y: number;
  } | null>(null);
  const [renameSpeakerDialog, setRenameSpeakerDialog] = useState<{
    spkId: number;
    value: string;
  } | null>(null);
  const [mergeSpeakerDialog, setMergeSpeakerDialog] = useState<{
    fromSpkId: number;
    toSpkId: number;
    fromName: string;
    toName: string;
  } | null>(null);

  // Export menu state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const { isExporting, exportProgress, canExport, exportAs } = useExport();

  // TTS
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const {
    regenerateByIndex,
    applyCandidateByIndex,
    discardCandidateByIndex,
    progress: ttsProgress,
  } = useTTSRegenerate();

  /**
   * 计算说话人统计信息
   * 返回去重后的说话人ID列表（排除已被合并的说话人）
   */
  const speakerStats = useMemo(() => {
    const speakerSet = new Set<number>();
    for (const seg of lastSegments) {
      if (typeof seg.spk === 'number') {
        // Get effective speaker after merges
        const effectiveSpk = getEffectiveSpeaker(seg.spk, speakerMerges);
        speakerSet.add(effectiveSpk);
      }
    }
    // 按说话人ID排序
    return Array.from(speakerSet).sort((a, b) => a - b);
  }, [lastSegments, speakerMerges]);

  // Hooks
  const { reorderComposition } = useComposition();
  const { highlightNow, startHighlightLoop, stopHighlightLoop, findActiveIndex } = useHighlight({
    audioRef,
  });
  const { startEditedPlayback, stopEditedPlayback, isPlaying } = useEditedPlayback({
    audioRef,
    ttsAudioRef,
    onHighlight: () => {
      const index = findActiveIndex();
      setActiveIndex(index);
    },
  });
  const { handleDragStart, handleDragOver, handleDragLeave, handleDrop } = useDragAndDrop({
    onReorder: reorderComposition,
  });

  const handleSearch = useCallback(async () => {
    if (!projectId || !searchQuery.trim()) {
      setSearchMatches([]);
      return;
    }
    setIsSearching(true);
    try {
      setSearchMatches(await searchTranscript(projectId, searchQuery.trim()));
    } catch (searchError) {
      console.error('字幕搜索失败:', searchError);
      setSearchMatches([]);
    } finally {
      setIsSearching(false);
    }
  }, [projectId, searchQuery]);

  const seekSearchMatch = useCallback(
    (match: SearchMatchV1) => {
      const clip = useEditorStore
        .getState()
        .timelineClips.find((item) => item.source_segment_id === match.segment.id);
      if (!clip || !audioRef.current) return;
      audioRef.current.currentTime = clip.source_in_ms / 1000;
      audioRef.current.focus();
    },
    [audioRef]
  );

  /**
   * Handle audio play event
   */
  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;

    const handlePlay = () => {
      startHighlightLoop();
    };

    const handlePause = () => {
      stopHighlightLoop();
      if (!isPlaying) {
        setActiveIndex(null);
      }
    };

    const handleEnded = () => {
      stopHighlightLoop();
      setActiveIndex(null);
      stopEditedPlayback();
    };

    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('ended', handleEnded);

    return () => {
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
    };
  }, [audioRef, startHighlightLoop, stopHighlightLoop, isPlaying, stopEditedPlayback]);

  /**
   * Update active index during playback using timeupdate event
   */
  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;

    const handleTimeUpdate = () => {
      if (!player.paused) {
        const index = findActiveIndex();
        setActiveIndex(index);
      }
    };

    player.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      player.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioRef, findActiveIndex]);

  /**
   * Handle seek to specific time or start edited playback
   * If content has been edited (reordered/deleted), use edited playback
   * If segment has TTS audio, play the TTS audio instead
   */
  const handleSeek = useCallback(
    (time: number, renderIndex?: number, originalIndex?: number) => {
      if (!audioRef.current) return;

      // Check if this segment has TTS audio
      if (originalIndex !== undefined && ttsAudioMap[originalIndex] && ttsAudioRef.current) {
        ttsAudioRef.current.src = ttsAudioMap[originalIndex];
        ttsAudioRef.current.play().catch(() => {});
        return;
      }

      // If edited and we have a valid render index, use edited playback
      if (hasEdited && renderIndex !== undefined && renderIndex >= 0) {
        startEditedPlayback(renderIndex);
        return;
      }

      // Normal playback - just seek and play
      audioRef.current.currentTime = time;
      if (!isNaN(audioRef.current.duration)) {
        audioRef.current.play().catch(() => {});
      }
      highlightNow();
    },
    [audioRef, highlightNow, hasEdited, startEditedPlayback, ttsAudioMap]
  );

  /**
   * Handle double-click to start edited playback from position
   */
  /**
   * Handle context menu — pass both render index and original index
   */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, index: number, originalIndex?: number) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, index, originalIndex);
    },
    [showContextMenu]
  );

  /**
   * Handle inline edit confirm — update text and regenerate TTS
   */
  const handleInlineEditConfirm = useCallback(
    async (newText: string, originalIndex: number) => {
      setInlineEditIndex(null);
      try {
        await regenerateByIndex(originalIndex, newText);
      } catch (error) {
        console.error('[TTS] Inline edit regeneration failed:', error);
        alert(`TTS 重生成失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [setInlineEditIndex, regenerateByIndex]
  );

  /**
   * Handle inline edit cancel
   */
  const handleInlineEditCancel = useCallback(() => {
    setInlineEditIndex(null);
  }, [setInlineEditIndex]);

  const playTTSCandidate = useCallback((url: string) => {
    if (!ttsAudioRef.current) return;
    ttsAudioRef.current.src = url;
    ttsAudioRef.current.play().catch((error) => {
      console.error('[TTS] Candidate preview failed:', error);
    });
  }, []);

  const handleApplyTTSCandidate = useCallback(
    async (segmentIndex: number) => {
      try {
        await applyCandidateByIndex(segmentIndex);
      } catch (error) {
        alert(`应用语音候选失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [applyCandidateByIndex]
  );

  const handlePadOrTrimCandidate = useCallback(
    async (segmentIndex: number, text: string) => {
      try {
        await regenerateByIndex(segmentIndex, text, 'pad_or_trim');
      } catch (error) {
        alert(`重新生成语音候选失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [regenerateByIndex]
  );

  /**
   * Handle right-click on speaker label to show context menu
   */
  const handleSpeakerContextMenu = useCallback(
    (e: React.MouseEvent, spkId: number) => {
      e.preventDefault();
      e.stopPropagation();
      setSpeakerMenu({ spkId, x: e.clientX, y: e.clientY });
    },
    []
  );

  /**
   * Close speaker context menu
   */
  const closeSpeakerMenu = useCallback(() => {
    setSpeakerMenu(null);
  }, []);

  /**
   * Handle edit speaker name from menu
   */
  const handleEditSpeakerName = useCallback(() => {
    if (!speakerMenu) return;
    const { spkId } = speakerMenu;
    const currentName = speakerNames[spkId] || `说话人 ${spkId + 1}`;
    setRenameSpeakerDialog({ spkId, value: currentName });
    closeSpeakerMenu();
  }, [speakerMenu, speakerNames, closeSpeakerMenu]);

  /**
   * Handle merge speaker from menu
   */
  const handleMergeSpeaker = useCallback(
    (toSpkId: number) => {
      if (!speakerMenu) return;
      const { spkId: fromSpkId } = speakerMenu;
      const fromName = speakerNames[fromSpkId] || `说话人 ${fromSpkId + 1}`;
      const toName = speakerNames[toSpkId] || `说话人 ${toSpkId + 1}`;
      setMergeSpeakerDialog({ fromSpkId, toSpkId, fromName, toName });
      closeSpeakerMenu();
    },
    [speakerMenu, speakerNames, closeSpeakerMenu]
  );

  // Close speaker menu when clicking outside
  useEffect(() => {
    if (!speakerMenu) return;
    const handleClickOutside = () => closeSpeakerMenu();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [speakerMenu, closeSpeakerMenu]);

  /**
   * Handle display mode change
   */
  const handleDisplayModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = e.target.value as DisplayMode;
    setDisplayMode(mode);
  };

  /**
   * Copy full text to clipboard
   */
  const handleCopyText = useCallback(() => {
    const activeComposition = isCharEditMode ? charComposition : composition;
    const activeData = isCharEditMode ? charLevelData : lastSegments;

    const text = activeComposition
      .map((idx) => {
        const item = activeData[idx];
        if (!item) return '';
        return 'text' in item ? item.text : (item as any).char;
      })
      .join('');

    navigator.clipboard.writeText(text).then(
      () => {
        alert('已复制到剪贴板');
      },
      () => {
        alert('复制失败');
      }
    );
  }, [isCharEditMode, composition, charComposition, lastSegments, charLevelData]);

  /**
   * 去除文本末尾的标点符号（用于口癖匹配）
   */
  const removePunctuation = useCallback((text: string): string => {
    if (!text) return '';
    return text.replace(/[。，、！？；：""''（）【】《》,.!?;:()\[\]<>]+$/g, '').trim();
  }, []);

  /**
   * Handle delete filler words (删除口癖)
   */
  const handleDeleteFiller = useCallback(() => {
    const trimmedFiller = fillerText.trim();
    if (!trimmedFiller) {
      alert('请输入要删除的口癖文本');
      return;
    }

    if (!lastSegments.length) {
      alert('没有可删除的文本');
      return;
    }

    // 停止播放
    stopEditedPlayback();

    // 去除用户输入的标点符号，用于匹配
    const normalizedFillerText = removePunctuation(trimmedFiller);

    // 根据当前模式查找匹配的 segments
    const matchedIndices: number[] = [];

    if (isCharEditMode) {
      // 逐字编辑模式
      for (let i = 0; i < charComposition.length; i++) {
        const idx = charComposition[i];
        const char = charLevelData[idx];
        if (char && removePunctuation(char.char) === normalizedFillerText) {
          matchedIndices.push(i);
        }
      }
    } else {
      // 逐段编辑模式
      for (let i = 0; i < composition.length; i++) {
        const idx = composition[i];
        const seg = lastSegments[idx];
        if (seg && removePunctuation(seg.text) === normalizedFillerText) {
          matchedIndices.push(i);
        }
      }
    }

    if (matchedIndices.length === 0) {
      alert(`未找到匹配的文本"${trimmedFiller}"`);
      return;
    }

    // 确认删除
    if (!confirm(`找到 ${matchedIndices.length} 个匹配项，确定要删除吗？`)) {
      return;
    }

    // 批量删除
    if (isCharEditMode) {
      deleteMultipleCharPositions(matchedIndices);
    } else {
      deleteMultiplePositions(matchedIndices);
    }

    // 清空输入框
    setFillerText('');
    alert(`已删除 ${matchedIndices.length} 个"${trimmedFiller}"`);
  }, [
    fillerText,
    lastSegments,
    charLevelData,
    composition,
    charComposition,
    isCharEditMode,
    removePunctuation,
    stopEditedPlayback,
    deleteMultiplePositions,
    deleteMultipleCharPositions,
  ]);

  /**
   * Auto-generate smart paragraph groups when switching to smart-paragraph mode
   */
  useEffect(() => {
    if (displayMode !== 'smart-paragraph') return;
    if (isSmartParagraphManuallyEdited && smartParagraphGroups.length > 0) return;
    if (!lastSegments.length) return;

    const activeComposition = isCharEditMode ? charComposition : composition;
    const activeData = isCharEditMode ? charLevelData : lastSegments;
    const list = activeComposition.map((idx) => activeData[idx]).filter(Boolean);

    if (list.length === 0) return;

    const paragraphs = groupSegmentsToParagraphs(list as any);

    // Build paragraph group structure (composition indices)
    let currentIndex = 0;
    const groups = paragraphs.map((para) => {
      const groupIndices: number[] = [];
      for (let i = 0; i < para.segments.length; i++) {
        groupIndices.push(currentIndex++);
      }
      return groupIndices;
    });

    setSmartParagraphGroups(groups);
  }, [
    displayMode,
    isSmartParagraphManuallyEdited,
    smartParagraphGroups.length,
    lastSegments,
    charLevelData,
    composition,
    charComposition,
    isCharEditMode,
    setSmartParagraphGroups,
  ]);

  /**
   * Render content based on display mode
   */
  const renderContent = () => {
    if (!lastSegments.length) {
      return <div className="text-gray-500">暂无识别结果</div>;
    }

    const activeComposition = isCharEditMode ? charComposition : composition;
    const activeData = isCharEditMode ? charLevelData : lastSegments;

    // Get segments to display based on composition
    const list = activeComposition.map((idx) => activeData[idx]).filter(Boolean);

    if (displayMode === 'smart-paragraph') {
      // Smart paragraph mode - use pre-computed groups
      if (smartParagraphGroups.length === 0) {
        // Groups not yet computed, show loading or empty
        return <div className="text-gray-500">正在计算分段...</div>;
      }

      const displayUnits = smartParagraphGroups.map((group) => {
        const segments = group.map((idx) => list[idx]).filter(Boolean);
        if (segments.length === 0) return null;
        return {
          segments,
          renderIndices: group,
          originalIndices: group.map((idx) => activeComposition[idx]),
        };
      }).filter(Boolean);

      return (
        <div className="text-area smart-paragraph">
          {displayUnits.map((unit, idx) => (
            <ParagraphGroup
              key={`para-${idx}`}
              segments={unit!.segments}
              renderIndices={unit!.renderIndices}
              originalIndices={unit!.originalIndices}
              activeIndex={activeIndex}
              onSeek={handleSeek}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(toIndex) => handleDrop(toIndex, stopEditedPlayback)}
              onReorder={reorderComposition}
              onContextMenu={handleContextMenu}
              ttsAudioMap={ttsAudioMap}
              ttsGeneratingMap={ttsGeneratingMap}
            />
          ))}
        </div>
      );
    } else if (displayMode === 'line-by-line') {
      // Line by line mode
      return (
        <div className="text-area line-by-line">
          {list.map((item, idx) => (
            <SentenceSpan
              key={`${idx}-${activeComposition[idx]}`}
              data={item}
              renderIndex={idx}
              originalIndex={activeComposition[idx]}
              isActive={idx === activeIndex}
              onSeek={handleSeek}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(toIndex) => handleDrop(toIndex, stopEditedPlayback)}
              onReorder={reorderComposition}
              onContextMenu={handleContextMenu}
              isInlineEditing={inlineEditIndex === idx}
              onInlineEditConfirm={handleInlineEditConfirm}
              onInlineEditCancel={handleInlineEditCancel}
              hasTTSAudio={!!ttsAudioMap[activeComposition[idx]]}
              isTTSGenerating={!!ttsGeneratingMap[activeComposition[idx]]}
            />
          ))}
        </div>
      );
    } else {
      // Continuous mode (default)
      return (
        <div className="text-area continuous">
          {list.map((item, idx) => (
            <SentenceSpan
              key={`${idx}-${activeComposition[idx]}`}
              data={item}
              renderIndex={idx}
              originalIndex={activeComposition[idx]}
              isActive={idx === activeIndex}
              onSeek={handleSeek}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(toIndex) => handleDrop(toIndex, stopEditedPlayback)}
              onReorder={reorderComposition}
              onContextMenu={handleContextMenu}
              isInlineEditing={inlineEditIndex === idx}
              onInlineEditConfirm={handleInlineEditConfirm}
              onInlineEditCancel={handleInlineEditCancel}
              hasTTSAudio={!!ttsAudioMap[activeComposition[idx]]}
              isTTSGenerating={!!ttsGeneratingMap[activeComposition[idx]]}
            />
          ))}
        </div>
      );
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-4">
      {/* Header with speaker stats */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">识别全文</h2>
          {projectId && (
            <div className="text-xs text-[var(--text-muted)]" data-testid="project-revision">
              Revision {revision}{isCommitting ? ' · 正在提交…' : ' · 已同步'}
            </div>
          )}
        </div>
        {speakerStats.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)]">
              {speakerStats.length} 位说话人:
            </span>
            <div className="flex items-center gap-1.5">
              {speakerStats.map((spkId) => (
                <span
                  key={spkId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: getSpeakerColor(spkId) }}
                  onContextMenu={(e) => handleSpeakerContextMenu(e, spkId)}
                  title="右键点击编辑名称或合并说话人"
                  data-testid={`speaker-${spkId}`}
                >
                  {speakerNames[spkId] || `说话人 ${spkId + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {(lastError || revisionConflict) && (
        <div
          className="mb-4 rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
          role="alert"
        >
          {revisionConflict ? '检测到其他客户端的新 revision，已刷新到最新版本。' : lastError}
        </div>
      )}

      {Object.keys(ttsCandidateMap).length > 0 && (
        <div
          className="mb-4 space-y-3 rounded border border-blue-500/40 bg-blue-500/10 p-3"
          data-testid="speech-candidate-panel"
        >
          <div className="text-sm font-medium">语音 replacement 候选</div>
          {ttsProgress && <div className="text-xs text-[var(--text-muted)]">{ttsProgress}</div>}
          {Object.entries(ttsCandidateMap).map(([indexText, candidate]) => {
            const segmentIndex = Number(indexText);
            const unsafeFit =
              candidate.operation.duration_policy === 'fit_source' &&
              !candidate.safeStretch;
            return (
              <div
                key={candidate.artifactId}
                className="rounded border border-[var(--border-input)] bg-[var(--bg-card)] p-3"
                data-testid={`speech-candidate-${segmentIndex}`}
              >
                <div className="mb-2 text-sm">
                  “{candidate.operation.text}” · {(candidate.durationMs / 1000).toFixed(2)}s ·{' '}
                  {candidate.operation.duration_policy}
                </div>
                {candidate.warnings.length > 0 && (
                  <ul className="mb-2 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">
                    {candidate.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded border border-[var(--border-input)] px-3 py-1 text-sm"
                    onClick={() => playTTSCandidate(candidate.previewUrl)}
                  >
                    试听候选
                  </button>
                  <button
                    className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                    disabled={unsafeFit || isCommitting}
                    onClick={() => void handleApplyTTSCandidate(segmentIndex)}
                  >
                    应用到时间线
                  </button>
                  {unsafeFit && (
                    <button
                      className="rounded bg-amber-600 px-3 py-1 text-sm text-white"
                      onClick={() =>
                        void handlePadOrTrimCandidate(
                          segmentIndex,
                          candidate.operation.text
                        )
                      }
                    >
                      改用 pad/trim
                    </button>
                  )}
                  <button
                    className="rounded px-3 py-1 text-sm text-[var(--text-muted)]"
                    onClick={() => discardCandidateByIndex(segmentIndex)}
                  >
                    放弃候选
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={displayMode}
          onChange={handleDisplayModeChange}
          className="rounded border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1 text-sm"
        >
          <option value="continuous">连续显示</option>
          <option value="line-by-line">逐行显示</option>
          <option value="smart-paragraph">智能分段</option>
        </select>

        {charLevelData.length > 0 && (
          <button
            onClick={toggleCharEditMode}
            className="rounded border border-[var(--border-input)] bg-[var(--bg-button)] px-3 py-1 text-sm"
          >
            {isCharEditMode ? '段落编辑' : '逐字编辑'}
          </button>
        )}

        <button
          onClick={undo}
          disabled={!canUndo || isCommitting}
          data-testid="undo-edit"
          className="rounded border border-[var(--border-input)] bg-[var(--bg-button)] px-2 py-1 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          title="撤回 (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          onClick={redo}
          disabled={!canRedo || isCommitting}
          data-testid="redo-edit"
          className="rounded border border-[var(--border-input)] bg-[var(--bg-button)] px-2 py-1 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          title="重做 (Ctrl+Shift+Z)"
        >
          ↷
        </button>

        <button
          onClick={resetEdits}
          className="rounded border border-[var(--border-input)] bg-[var(--bg-button)] px-3 py-1 text-sm"
        >
          重置编辑
        </button>

        <button
          onClick={handleCopyText}
          className="rounded border border-[var(--border-input)] bg-[var(--bg-button)] px-3 py-1 text-sm"
        >
          复制全文
        </button>

        {/* Export dropdown - prominent button */}
        <div className="relative inline-block ml-auto">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={!canExport || isExporting}
            data-testid="export-menu"
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isExporting ? exportProgress : '导出 ▼'}
          </button>

          {showExportMenu && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowExportMenu(false)}
              />
              {/* Menu */}
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] py-1 shadow-lg">
                <div className="border-b border-[var(--border-input)] px-3 py-1 text-xs text-[var(--text-muted)]">
                  媒体文件
                </div>
                {mediaType === 'video' && (
                  <button
                    data-testid="export-mp4"
                    className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-button)]"
                    onClick={() => {
                      exportAs('mp4');
                      setShowExportMenu(false);
                    }}
                  >
                    MP4 视频
                  </button>
                )}
                <button
                  data-testid="export-mp3"
                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-button)]"
                  onClick={() => {
                    exportAs('mp3');
                    setShowExportMenu(false);
                  }}
                >
                  MP3 音频
                </button>
                <button
                  data-testid="export-wav"
                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-button)]"
                  onClick={() => {
                    exportAs('wav');
                    setShowExportMenu(false);
                  }}
                >
                  WAV 音频
                </button>

                <div className="border-b border-t border-[var(--border-input)] px-3 py-1 text-xs text-[var(--text-muted)]">
                  字幕文件
                </div>
                <button
                  data-testid="export-srt"
                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-button)]"
                  onClick={() => {
                    exportAs('srt');
                    setShowExportMenu(false);
                  }}
                >
                  SRT 字幕
                </button>
                <button
                  data-testid="export-vtt"
                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-button)]"
                  onClick={() => {
                    exportAs('vtt');
                    setShowExportMenu(false);
                  }}
                >
                  VTT 字幕
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Server-backed transcript search */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSearch();
            }}
            placeholder="搜索字幕"
            aria-label="搜索字幕"
            data-testid="transcript-search"
            className="min-w-0 flex-1 rounded border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => void handleSearch()}
            disabled={isSearching || !searchQuery.trim()}
            className="rounded border border-[var(--border-input)] bg-[var(--bg-button)] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {isSearching ? '搜索中…' : '搜索'}
          </button>
        </div>
        {searchQuery.trim() && !isSearching && (
          <div className="mt-2 text-xs text-[var(--text-muted)]" data-testid="search-count">
            找到 {searchMatches.length} 条结果
          </div>
        )}
        {searchMatches.length > 0 && (
          <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded border border-[var(--border-input)] p-2">
            {searchMatches.map((match) => (
              <button
                key={match.segment.id}
                onClick={() => seekSearchMatch(match)}
                className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover-bg)]"
              >
                <span className="text-[var(--text-muted)]">
                  {(match.segment.start_ms / 1000).toFixed(1)}s ·{' '}
                </span>
                {match.segment.text}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filler word deletion - separate row */}
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={fillerText}
          onChange={(e) => setFillerText(e.target.value)}
          placeholder="输入口癖文本"
          className="w-32 rounded border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-sm"
        />
        <button
          onClick={handleDeleteFiller}
          disabled={!fillerText.trim() || !lastSegments.length}
          className="rounded border border-[var(--border-input)] bg-[var(--bg-button)] px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
        >
          删除口癖
        </button>
      </div>

      {/* Content area */}
      <div className="rounded bg-[var(--bg-text-area)] p-4 text-[var(--text-primary)]">
        {renderContent()}
      </div>

      {/* Hidden TTS audio element */}
      <audio ref={ttsAudioRef} className="hidden" />

      {renameSpeakerDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="编辑说话人名称">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-4 shadow-xl">
            <label htmlFor="speaker-name-input" className="mb-2 block text-sm font-medium">
              说话人名称
            </label>
            <input
              id="speaker-name-input"
              value={renameSpeakerDialog.value}
              onChange={(event) =>
                setRenameSpeakerDialog({ ...renameSpeakerDialog, value: event.target.value })
              }
              className="w-full rounded border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded px-3 py-1.5" onClick={() => setRenameSpeakerDialog(null)}>
                取消
              </button>
              <button
                className="rounded bg-blue-600 px-3 py-1.5 text-white"
                onClick={() => {
                  setSpeakerName(renameSpeakerDialog.spkId, renameSpeakerDialog.value);
                  setRenameSpeakerDialog(null);
                }}
              >
                保存名称
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeSpeakerDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="合并说话人">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-4 shadow-xl">
            <p className="text-sm">
              确定将「{mergeSpeakerDialog.fromName}」合并到「{mergeSpeakerDialog.toName}」吗？
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded px-3 py-1.5" onClick={() => setMergeSpeakerDialog(null)}>
                取消
              </button>
              <button
                className="rounded bg-blue-600 px-3 py-1.5 text-white"
                onClick={() => {
                  mergeSpeaker(mergeSpeakerDialog.fromSpkId, mergeSpeakerDialog.toSpkId);
                  setMergeSpeakerDialog(null);
                }}
              >
                确认合并
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Speaker context menu */}
      {speakerMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] py-1 shadow-lg"
          style={{ left: speakerMenu.x, top: speakerMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg-button)] transition-colors"
            onClick={handleEditSpeakerName}
          >
            ✏️ 编辑名称
          </button>
          {speakerStats.length > 1 && (
            <>
              <div className="my-1 border-t border-[var(--border-input)]" />
              <div className="px-4 py-1 text-xs text-[var(--text-muted)]">
                合并到:
              </div>
              {speakerStats
                .filter((spkId) => spkId !== speakerMenu.spkId)
                .map((spkId) => (
                  <button
                    key={spkId}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg-button)] transition-colors flex items-center gap-2"
                    onClick={() => handleMergeSpeaker(spkId)}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: getSpeakerColor(spkId) }}
                    />
                    {speakerNames[spkId] || `说话人 ${spkId + 1}`}
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
