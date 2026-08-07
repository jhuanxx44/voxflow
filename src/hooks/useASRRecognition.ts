/** Project-backed upload -> persistent ASR job -> editor hydration flow. */

import { useCallback, useState } from 'react';
import { useASRStore } from '@/stores/asrStore';
import { useEditorStore } from '@/stores/editorStore';
import {
  createProject,
  loadProjectEditor,
  startTranscription,
  waitForJob,
} from '@/services/projectService';

export interface UseASRRecognitionOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onCacheHit?: () => void;
}

export const useASRRecognition = (options: UseASRRecognitionOptions = {}) => {
  const [error, setError] = useState<Error | null>(null);
  const {
    currentFile,
    currentMaterial,
    recognitionMode,
    hotwords,
    setIsRecognizing,
    setUsedHotwords,
    setUploadedFileId,
    setAudioUrl,
    setMediaType,
  } = useASRStore();
  const hydrateProject = useEditorStore((state) => state.hydrateProject);

  const performRecognition = useCallback(async () => {
    setError(null);
    if (!currentFile && !currentMaterial) {
      const missing = new Error('请先选择音频文件或素材');
      setError(missing);
      options.onError?.(missing);
      return;
    }

    setIsRecognizing(true);
    try {
      const project = await createProject({
        file: currentFile || undefined,
        materialName: currentMaterial || undefined,
        name: currentMaterial || currentFile?.name.replace(/\.[^.]+$/, ''),
      });
      setAudioUrl(project.source_url);
      setMediaType(project.source.media.has_video ? 'video' : 'audio');
      setUploadedFileId(null);

      const job = await startTranscription(project.id, {
        model: recognitionMode,
        hotwords: hotwords.trim(),
      });
      await waitForJob(job.id);
      const snapshot = await loadProjectEditor(project.id);
      hydrateProject(snapshot);
      setUsedHotwords(hotwords.trim() || null);
      options.onSuccess?.();
    } catch (caught) {
      const failure = caught instanceof Error ? caught : new Error(String(caught));
      console.error('识别失败:', failure);
      setError(failure);
      options.onError?.(failure);
    } finally {
      setIsRecognizing(false);
    }
  }, [
    currentFile,
    currentMaterial,
    recognitionMode,
    hotwords,
    setIsRecognizing,
    setUsedHotwords,
    setUploadedFileId,
    setAudioUrl,
    setMediaType,
    hydrateProject,
    options,
  ]);

  return { performRecognition, error };
};
