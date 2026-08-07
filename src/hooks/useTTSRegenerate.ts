/** Persistent project-backed two-phase speech replacement workflow. */

import { useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import {
  previewEdit,
  startSpeechReplacement,
} from '@/services/projectService';
import type {
  SpeechDurationPolicy,
  SpeechReplacementCandidateV1,
} from '@/types/project';

function uniqueWarnings(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))];
}

export function useTTSRegenerate() {
  const [progress, setProgress] = useState('');

  const lastSegments = useEditorStore((state) => state.lastSegments);
  const composition = useEditorStore((state) => state.composition);
  const ttsGeneratingMap = useEditorStore((state) => state.ttsGeneratingMap);
  const setTTSAudio = useEditorStore((state) => state.setTTSAudio);
  const setTTSGenerating = useEditorStore((state) => state.setTTSGenerating);
  const setTTSCandidate = useEditorStore((state) => state.setTTSCandidate);
  const removeTTSCandidate = useEditorStore((state) => state.removeTTSCandidate);
  const removeTTSAudio = useEditorStore((state) => state.removeTTSAudio);
  const applySpeechCandidate = useEditorStore((state) => state.applySpeechCandidate);

  const isRegenerating = Object.values(ttsGeneratingMap).some(Boolean);

  const regenerateByIndex = useCallback(
    async (
      segmentIndex: number,
      newText?: string,
      durationPolicy?: SpeechDurationPolicy
    ): Promise<SpeechReplacementCandidateV1 | undefined> => {
      const state = useEditorStore.getState();
      const segment = state.lastSegments[segmentIndex];
      const clip = state.timelineClips[segmentIndex];
      if (!state.projectId || !clip || !segment) {
        throw new Error('当前片段尚未关联持久化 VoxFlow project');
      }
      const textToSynthesize = (newText ?? segment.text).trim();
      if (!textToSynthesize) return undefined;

      setTTSGenerating(segmentIndex, true);
      setProgress('正在生成持久化语音候选…');
      try {
        const candidate = await startSpeechReplacement(
          state.projectId,
          state.revision,
          clip.id,
          textToSynthesize,
          {
            durationPolicy,
            onProgress: (job) => {
              const percent = Math.round(job.progress * 100);
              setProgress(`语音候选 ${job.phase} · ${percent}%`);
            },
          }
        );
        const preview = await previewEdit(
          state.projectId,
          state.revision,
          [candidate.operation],
          'Web: preview speech replacement'
        );
        const ready = {
          ...candidate,
          warnings: uniqueWarnings(candidate.warnings, preview.diff.warnings),
        };
        setTTSAudio(segmentIndex, ready.previewUrl, ready.durationMs);
        setTTSCandidate(segmentIndex, ready);
        setProgress('候选已生成：请先试听，再应用到时间线');
        return ready;
      } catch (error) {
        setTTSGenerating(segmentIndex, false);
        setProgress('');
        throw error;
      }
    },
    [setTTSAudio, setTTSGenerating, setTTSCandidate]
  );

  const applyCandidateByIndex = useCallback(
    async (segmentIndex: number) => {
      const candidate = useEditorStore.getState().ttsCandidateMap[segmentIndex];
      if (!candidate) throw new Error('语音候选不存在或已失效');
      if (
        candidate.operation.duration_policy === 'fit_source' &&
        !candidate.safeStretch
      ) {
        throw new Error('拉伸比例超出安全范围，请改用 pad/trim 策略重新生成');
      }
      setProgress('正在应用候选并创建新 revision…');
      await applySpeechCandidate(segmentIndex, candidate.operation);
      setProgress('语音 replacement 已提交');
    },
    [applySpeechCandidate]
  );

  const discardCandidateByIndex = useCallback(
    (segmentIndex: number) => {
      removeTTSCandidate(segmentIndex);
      const clip = useEditorStore.getState().timelineClips[segmentIndex];
      if (clip?.replacement_artifact_id) {
        setTTSAudio(
          segmentIndex,
          `/api/v1/artifacts/${clip.replacement_artifact_id}/content`,
          clip.replacement_duration_ms ?? undefined
        );
      } else {
        removeTTSAudio(segmentIndex);
      }
      setProgress('');
    },
    [removeTTSAudio, removeTTSCandidate, setTTSAudio]
  );

  const regenerateByText = useCallback(
    async (text: string) => {
      const normalizedText = text
        .replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
        .trim();
      if (!normalizedText) return;

      const matchingOriginalIndices = composition.filter((index) => {
        const segment = lastSegments[index];
        if (!segment) return false;
        return (
          segment.text
            .replace(/[。，、！？；：""''（）【】《》,.!?;:()[\]<>]+$/g, '')
            .trim() === normalizedText
        );
      });
      if (!matchingOriginalIndices.length) return;

      const errors: string[] = [];
      for (let index = 0; index < matchingOriginalIndices.length; index += 1) {
        const segmentIndex = matchingOriginalIndices[index];
        setProgress(
          `正在生成候选 ${index + 1}/${matchingOriginalIndices.length}: “${text.slice(0, 20)}”`
        );
        try {
          await regenerateByIndex(segmentIndex);
        } catch (error) {
          errors.push(
            `Segment ${segmentIndex}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      if (errors.length) throw new Error(`部分 TTS 候选生成失败:\n${errors.join('\n')}`);
    },
    [composition, lastSegments, regenerateByIndex]
  );

  return {
    regenerateByIndex,
    regenerateByText,
    applyCandidateByIndex,
    discardCandidateByIndex,
    isRegenerating,
    progress,
  };
}
