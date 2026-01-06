/**
 * useCache Hook
 *
 * Manages LocalStorage cache for ASR recognition results.
 * Handles cache storage, retrieval, expiration, and cleanup.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ASRResult } from '@/types/asr';

const CACHE_PREFIX = 'asr_cache_';
const CACHE_INDEX_KEY = 'asr_cache_index';
const CACHE_EXPIRY_DAYS = 7;

export interface CacheData {
  timestamp: number;
  fileName: string;
  result: ASRResult & { hotwords_used?: string | null };
}

export interface CacheIndex {
  [fileId: string]: {
    fileName: string;
    timestamp: number;
  };
}

export interface CacheStats {
  count: number;
  totalSize: number;
  totalSizeKB: string;
}

/**
 * Generate file identifier (hash) for caching
 */
async function getFileIdentifier(file: File): Promise<string> {
  try {
    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();

    // Use crypto.subtle to generate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return hashHex;
  } catch (e) {
    // Fallback to simple hash if crypto API fails
    console.warn('Crypto API failed, using fallback hash:', e);
    return `${file.name}_${file.size}_${file.lastModified}`;
  }
}

/**
 * Build cache key including configuration
 */
export function buildCacheKey(
  fileId: string,
  isAdvanced: boolean,
  hotwords: string
): string {
  const mode = isAdvanced ? 'adv' : 'basic';
  const hotwordsPart = hotwords.trim() || 'nohotwords';
  return `${fileId}_${mode}_${hotwordsPart}`;
}

/**
 * useCache Hook
 */
export const useCache = () => {
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    count: 0,
    totalSize: 0,
    totalSizeKB: '0',
  });

  /**
   * Get cache index
   */
  const getCacheIndex = useCallback((): CacheIndex => {
    try {
      const indexData = localStorage.getItem(CACHE_INDEX_KEY);
      if (!indexData) return {};
      return JSON.parse(indexData);
    } catch (e) {
      console.error('获取缓存索引失败:', e);
      return {};
    }
  }, []);

  /**
   * Save cache index
   */
  const saveCacheIndex = useCallback((index: CacheIndex) => {
    try {
      localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.error('保存缓存索引失败:', e);
    }
  }, []);

  /**
   * Get from cache
   */
  const getFromCache = useCallback((cacheKey: string): CacheData | null => {
    if (!cacheKey) return null;

    try {
      const cached = localStorage.getItem(CACHE_PREFIX + cacheKey);
      if (!cached) return null;

      const data = JSON.parse(cached);

      // Check expiration (7 days)
      const cacheTime = data.timestamp || 0;
      const now = Date.now();
      const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      if (now - cacheTime > expiryMs) {
        // Expired, remove from cache
        removeFromCache(cacheKey);
        return null;
      }

      return data;
    } catch (e) {
      console.error('读取缓存失败:', e);
      return null;
    }
  }, []);

  /**
   * Save to cache
   */
  const saveToCache = useCallback(
    (
      cacheKey: string,
      fileName: string,
      result: ASRResult & { hotwords_used?: string | null }
    ) => {
      if (!cacheKey) return;

      try {
        const cacheData: CacheData = {
          timestamp: Date.now(),
          fileName,
          result,
        };

        localStorage.setItem(
          CACHE_PREFIX + cacheKey,
          JSON.stringify(cacheData)
        );

        // Update index
        const index = getCacheIndex();
        index[cacheKey] = {
          fileName,
          timestamp: Date.now(),
        };
        saveCacheIndex(index);

        console.log('ASR结果已缓存:', fileName);
        updateCacheStats();
      } catch (e) {
        console.error('保存缓存失败:', e);

        // If quota exceeded, try to clean old cache
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          clearOldestCache();

          // Retry once
          try {
            localStorage.setItem(
              CACHE_PREFIX + cacheKey,
              JSON.stringify({
                timestamp: Date.now(),
                fileName,
                result,
              })
            );
          } catch (e2) {
            console.error('重试保存缓存仍然失败:', e2);
          }
        }
      }
    },
    [getCacheIndex, saveCacheIndex]
  );

  /**
   * Remove from cache
   */
  const removeFromCache = useCallback(
    (cacheKey: string) => {
      if (!cacheKey) return;

      try {
        localStorage.removeItem(CACHE_PREFIX + cacheKey);
        const index = getCacheIndex();
        delete index[cacheKey];
        saveCacheIndex(index);
        updateCacheStats();
      } catch (e) {
        console.error('删除缓存失败:', e);
      }
    },
    [getCacheIndex, saveCacheIndex]
  );

  /**
   * Clear oldest cache entry
   */
  const clearOldestCache = useCallback(() => {
    try {
      const index = getCacheIndex();
      const entries = Object.entries(index);
      if (entries.length === 0) return;

      // Sort by timestamp, delete oldest
      entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
      const oldestId = entries[0][0];
      removeFromCache(oldestId);
      console.log('已清理最旧的缓存');
    } catch (e) {
      console.error('清理缓存失败:', e);
    }
  }, [getCacheIndex, removeFromCache]);

  /**
   * Clear all cache
   */
  const clearAllCache = useCallback(() => {
    try {
      const index = getCacheIndex();
      Object.keys(index).forEach((cacheKey) => {
        localStorage.removeItem(CACHE_PREFIX + cacheKey);
      });
      localStorage.removeItem(CACHE_INDEX_KEY);
      console.log('已清除所有ASR缓存');
      updateCacheStats();
      return true;
    } catch (e) {
      console.error('清除所有缓存失败:', e);
      return false;
    }
  }, [getCacheIndex]);

  /**
   * Update cache statistics
   */
  const updateCacheStats = useCallback(() => {
    try {
      const index = getCacheIndex();
      const count = Object.keys(index).length;
      let totalSize = 0;

      Object.keys(index).forEach((cacheKey) => {
        const data = localStorage.getItem(CACHE_PREFIX + cacheKey);
        if (data) {
          totalSize += data.length * 2; // UTF-16 encoding estimate
        }
      });

      setCacheStats({
        count,
        totalSize,
        totalSizeKB: (totalSize / 1024).toFixed(2),
      });
    } catch (e) {
      console.error('获取缓存统计失败:', e);
      setCacheStats({ count: 0, totalSize: 0, totalSizeKB: '0' });
    }
  }, [getCacheIndex]);

  /**
   * Generate file ID for caching
   */
  const generateFileId = useCallback(
    async (file: File | null, materialName: string | null): Promise<string> => {
      if (materialName) {
        return materialName;
      }
      if (file) {
        return await getFileIdentifier(file);
      }
      return '';
    },
    []
  );

  // Update stats on mount
  useEffect(() => {
    updateCacheStats();
  }, [updateCacheStats]);

  return {
    cacheStats,
    getFromCache,
    saveToCache,
    removeFromCache,
    clearAllCache,
    clearOldestCache,
    updateCacheStats,
    generateFileId,
    buildCacheKey,
  };
};
