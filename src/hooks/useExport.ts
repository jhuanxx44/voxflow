/**
 * useExport hook - 处理媒体和字幕导出逻辑
 */

import { useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useASRStore } from '@/stores/asrStore';
import {
  exportMedia,
  generateSRT,
  generateVTT,
  downloadBlob,
  downloadText,
  type ExportSegment,
  type ExportSource,
} from '@/services/exportService';

export type ExportFormat = 'mp4' | 'mp3' | 'wav' | 'srt' | 'vtt';

export interface UseExportReturn {
  isExporting: boolean;
  exportProgress: string;
  canExport: boolean;
  exportAs: (format: ExportFormat) => Promise<void>;
}

export function useExport(): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  const composition = useEditorStore((state) => state.composition);
  const charComposition = useEditorStore((state) => state.charComposition);
  const lastSegments = useEditorStore((state) => state.lastSegments);
  const charLevelData = useEditorStore((state) => state.charLevelData);
  const isCharEditMode = useEditorStore((state) => state.isCharEditMode);

  const currentMaterial = useASRStore((state) => state.currentMaterial);
  const currentFile = useASRStore((state) => state.currentFile);
  const uploadedFileId = useASRStore((state) => state.uploadedFileId);

  /**
   * 从当前 composition 构建导出片段
   */
  const buildExportSegments = useCallback((): ExportSegment[] => {
    const activeComposition = isCharEditMode ? charComposition : composition;
    const activeData = isCharEditMode ? charLevelData : lastSegments;

    return activeComposition
      .map((idx) => {
        const item = activeData[idx];
        if (!item) return null;

        return {
          start: item.start || 0,
          end: item.end || item.start || 0,
          text: 'text' in item ? item.text : (item as { char: string }).char,
        };
      })
      .filter((seg): seg is ExportSegment => seg !== null);
  }, [composition, charComposition, lastSegments, charLevelData, isCharEditMode]);

  /**
   * 构建导出源信息
   */
  const buildExportSource = useCallback((): ExportSource | null => {
    if (currentMaterial) {
      return { type: 'material', name: currentMaterial };
    }
    // 上传文件：使用 file_id
    if (uploadedFileId && currentFile) {
      return { type: 'upload', name: currentFile.name, file_id: uploadedFileId };
    }
    return null;
  }, [currentMaterial, uploadedFileId, currentFile]);

  /**
   * 检查是否可以导出
   */
  const canExport = Boolean(
    (composition.length > 0 || charComposition.length > 0) &&
      (currentMaterial || currentFile)
  );

  /**
   * 导出为指定格式
   */
  const exportAs = useCallback(
    async (format: ExportFormat) => {
      if (isExporting) return;

      const segments = buildExportSegments();
      if (segments.length === 0) {
        alert('没有可导出的内容');
        return;
      }

      // 获取基础文件名（用于字幕文件命名）
      const baseName = currentMaterial
        ? currentMaterial.replace(/\.[^.]+$/, '')
        : currentFile?.name?.replace(/\.[^.]+$/, '') || 'export';

      // 处理字幕格式（纯前端处理）
      if (format === 'srt') {
        const content = generateSRT(segments);
        downloadText(content, `${baseName}_subtitles.srt`, 'text/plain;charset=utf-8');
        return;
      }

      if (format === 'vtt') {
        const content = generateVTT(segments);
        downloadText(content, `${baseName}_subtitles.vtt`, 'text/vtt;charset=utf-8');
        return;
      }

      // 处理媒体格式（需要后端处理）
      const source = buildExportSource();
      if (!source) {
        alert('无法导出：文件信息不完整或已过期，请重新上传并识别');
        return;
      }

      setIsExporting(true);
      setExportProgress('正在处理...');

      try {
        const result = await exportMedia(
          {
            segments,
            source,
            outputFormat: format,
          },
          setExportProgress
        );

        if (result.blob) {
          // 直接下载
          downloadBlob(result.blob, result.filename);
          setExportProgress('导出完成！');
        } else if (result.downloadUrl) {
          // 打开下载链接
          window.open(result.downloadUrl, '_blank');
          setExportProgress('文件已准备，正在下载...');
        }
      } catch (error) {
        console.error('Export error:', error);
        setExportProgress('');
        alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setIsExporting(false);
        // 3 秒后清除进度提示
        setTimeout(() => setExportProgress(''), 3000);
      }
    },
    [
      isExporting,
      buildExportSegments,
      buildExportSource,
      currentMaterial,
      currentFile,
    ]
  );

  return {
    isExporting,
    exportProgress,
    canExport,
    exportAs,
  };
}
