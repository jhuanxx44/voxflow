/**
 * useTTSRegenerate - Hook for TTS regeneration with voice cloning
 *
 * Handles:
 * - Reference audio segment selection based on speaker ID
 * - TTS generation via backend proxy
 * - Store state management (generating status, audio blobs)
 */

import { useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useASRStore } from '@/stores/asrStore';
import { generateTTS } from '@/services/ttsService';
import type { TTSSource } from '@/services/ttsService';

/** Minimum segment duration (ms) for reference audio */
const MIN_REF_SEGMENT_DURATION = 500;

/** Target total reference audio duration (ms) */
const TARGET_REF_DURATION = 5000;

/**
 * Select reference audio segments for a given speaker.
 * Picks the longest segments from the same speaker until reaching the target duration.
 */
function selectRefSegments(
  segments: Array<{ start: number; end: number; spk?: number | null }>,
  targetSpk: number,
  excludeIndex?: number
): Array<{ start: number; end: number }> {
  // Find all segments from the same speaker
  const candidates = segments
    .map((seg, idx) => ({ ...seg, idx }))
    .filter((seg) => {
      if (seg.spk !== targetSpk) return false;
      if (excludeIndex !== undefined && seg.idx === excludeIndex) return false;
      const duration = (seg.end || seg.start) - seg.start;
      return duration >= MIN_REF_SEGMENT_DURATION;
    })
    .map((seg) => ({
      start: seg.start,
      end: seg.end || seg.start,
      duration: (seg.end || seg.start) - seg.start,
    }));

  // Sort by duration descending
  candidates.sort((a, b) => b.duration - a.duration);

  // Accumulate until target duration
  const selected: Array<{ start: number; end: number }> = [];
  let totalDuration = 0;

  for (const seg of candidates) {
    selected.push({ start: seg.start, end: seg.end });
    totalDuration += seg.duration;
    if (totalDuration >= TARGET_REF_DURATION) break;
  }

  return selected;
}

/**
 * Get the TTS source info from ASR store state
 */
function getTTSSource(
  currentMaterial: string | null,
  uploadedFileId: string | null
): TTSSource | null {
  if (currentMaterial) {
    return { type: 'material', name: currentMaterial };
  }
  if (uploadedFileId) {
    return { type: 'upload', file_id: uploadedFileId };
  }
  return null;
}

export function useTTSRegenerate() {
  const [progress, setProgress] = useState('');

  const lastSegments = useEditorStore((s) => s.lastSegments);
  const composition = useEditorStore((s) => s.composition);
  const setTTSAudio = useEditorStore((s) => s.setTTSAudio);
  const setTTSGenerating = useEditorStore((s) => s.setTTSGenerating);
  const ttsGeneratingMap = useEditorStore((s) => s.ttsGeneratingMap);
  const replaceSegmentTextByIndex = useEditorStore((s) => s.replaceSegmentTextByIndex);

  const currentMaterial = useASRStore((s) => s.currentMaterial);
  const uploadedFileId = useASRStore((s) => s.uploadedFileId);

  const isRegenerating = Object.values(ttsGeneratingMap).some(Boolean);

  /**
   * Regenerate TTS for a specific segment by its original index in lastSegments
   */
  const regenerateByIndex = useCallback(
    async (segmentIndex: number, newText?: string) => {
      const segment = lastSegments[segmentIndex];
      if (!segment) {
        console.warn('[TTS] Segment not found:', segmentIndex);
        return;
      }

      const source = getTTSSource(currentMaterial, uploadedFileId);
      if (!source) {
        console.warn('[TTS] No source file available');
        throw new Error('没有源文件，无法进行 TTS 重生成');
      }

      // If new text provided, update the specific segment text
      if (newText !== undefined && newText !== segment.text) {
        replaceSegmentTextByIndex(segmentIndex, newText);
      }

      const textToSynthesize = newText || segment.text;
      if (!textToSynthesize.trim()) {
        console.warn('[TTS] Empty text, skipping');
        return;
      }

      // Select reference segments for voice cloning
      const targetSpk = segment.spk;
      const refSegments =
        typeof targetSpk === 'number'
          ? selectRefSegments(lastSegments, targetSpk, segmentIndex)
          : [];

      // Set generating state
      setTTSGenerating(segmentIndex, true);

      try {
        const result = await generateTTS({
          text: textToSynthesize,
          source,
          refSegments,
        });

        setTTSAudio(segmentIndex, result.blobUrl, result.durationMs);
        console.log(
          `[TTS] Generated for segment ${segmentIndex}: ${result.durationMs?.toFixed(0)}ms`
        );
      } catch (error) {
        setTTSGenerating(segmentIndex, false);
        throw error;
      }
    },
    [lastSegments, currentMaterial, uploadedFileId, setTTSAudio, setTTSGenerating, replaceSegmentTextByIndex]
  );

  /**
   * Regenerate TTS for segments matching a given text string.
   * Uses punctuation-normalized matching (same as deleteByText).
   */
  const regenerateByText = useCallback(
    async (text: string) => {
      const normalizedText = text
        .replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
        .trim();

      if (!normalizedText) return;

      // Find matching segment indices in the composition
      const matchingOriginalIndices: number[] = [];
      for (let i = 0; i < composition.length; i++) {
        const idx = composition[i];
        const seg = lastSegments[idx];
        if (!seg) continue;
        const segText = seg.text
          .replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
          .trim();
        if (segText === normalizedText) {
          matchingOriginalIndices.push(idx);
        }
      }

      if (matchingOriginalIndices.length === 0) {
        console.warn(`[TTS] No matching segments for text: "${text}"`);
        return;
      }

      // Regenerate each matching segment
      const errors: string[] = [];
      for (let i = 0; i < matchingOriginalIndices.length; i++) {
        const segIdx = matchingOriginalIndices[i];
        setProgress(`正在处理 ${i + 1}/${matchingOriginalIndices.length}: "${text.slice(0, 20)}..."`);
        try {
          await regenerateByIndex(segIdx);
        } catch (e) {
          errors.push(`Segment ${segIdx}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      setProgress('');

      if (errors.length > 0) {
        throw new Error(`部分 TTS 生成失败:\n${errors.join('\n')}`);
      }
    },
    [composition, lastSegments, regenerateByIndex]
  );

  return {
    regenerateByIndex,
    regenerateByText,
    isRegenerating,
    progress,
  };
}
