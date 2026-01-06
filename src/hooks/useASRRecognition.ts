/**
 * useASRRecognition Hook
 *
 * Manages ASR recognition process including cache checking,
 * API calls, and result handling.
 */

import { useCallback, useState } from 'react';
import { useASRStore } from '@/stores/asrStore';
import { useEditorStore } from '@/stores/editorStore';
import { recognize, normalizeResult } from '@/services/asrService';
import { useCache } from './useCache';
import { buildCharLevelData } from '@/utils/charLevelBuilder';

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
    cacheEnabled,
    setIsRecognizing,
    setUsedHotwords,
  } = useASRStore();

  const { setRecognitionResult } = useEditorStore();

  const {
    getFromCache,
    saveToCache,
    removeFromCache,
    generateFileId,
    buildCacheKey,
  } = useCache();

  /**
   * Perform ASR recognition
   */
  const performRecognition = useCallback(async () => {
    setError(null);

    // Validate input
    if (!currentFile && !currentMaterial) {
      const err = new Error('请先选择音频文件或素材');
      setError(err);
      options.onError?.(err);
      return;
    }

    setIsRecognizing(true);

    try {
      // Generate file ID and cache key
      const fileId = await generateFileId(currentFile, currentMaterial);
      const isAdvanced = recognitionMode === 'advanced';
      const cacheKey = buildCacheKey(fileId, isAdvanced, hotwords);

      // Check cache if enabled
      if (cacheEnabled) {
        const cached = getFromCache(cacheKey);
        if (cached && cached.result) {
          // Normalize result
          const { full_text, segments } = normalizeResult(cached.result);

          // Build character-level data
          const charLevelData = buildCharLevelData(segments);

          // Update editor store
          setRecognitionResult(full_text, segments, charLevelData);

          // Update used hotwords
          setUsedHotwords(cached.result.hotwords_used || null);

          // Trigger callback
          options.onCacheHit?.();
          options.onSuccess?.();

          setIsRecognizing(false);
          return;
        }
      }

      // Cache miss or disabled, perform recognition
      const result = await recognize({
        file: currentFile || undefined,
        materialName: currentMaterial || undefined,
        enableAdvanced: isAdvanced,
        hotwords: hotwords.trim() || undefined,
      });

      // Save to cache if enabled
      if (cacheEnabled) {
        const fileName = currentMaterial || currentFile?.name || 'unknown';
        saveToCache(cacheKey, fileName, result);
      }

      // Normalize result
      const { full_text, segments } = normalizeResult(result);

      // Build character-level data
      const charLevelData = buildCharLevelData(segments);

      // Update editor store
      setRecognitionResult(full_text, segments, charLevelData);

      // Update used hotwords
      setUsedHotwords(result.hotwords_used || null);

      // Trigger callback
      options.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('识别失败:', error);
      setError(error);
      options.onError?.(error);

      // If cache error, try to remove corrupted cache
      if (error.message.includes('缓存')) {
        try {
          const fileId = await generateFileId(currentFile, currentMaterial);
          const isAdvanced = recognitionMode === 'advanced';
          const cacheKey = buildCacheKey(fileId, isAdvanced, hotwords);
          removeFromCache(cacheKey);
        } catch (e) {
          console.error('移除损坏缓存失败:', e);
        }
      }
    } finally {
      setIsRecognizing(false);
    }
  }, [
    currentFile,
    currentMaterial,
    recognitionMode,
    hotwords,
    cacheEnabled,
    setIsRecognizing,
    setUsedHotwords,
    setRecognitionResult,
    getFromCache,
    saveToCache,
    removeFromCache,
    generateFileId,
    buildCacheKey,
    options,
  ]);

  return {
    performRecognition,
    error,
  };
};
