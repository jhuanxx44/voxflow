/** Persistent project export job and artifact download flow. */

import { useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { exportProject } from '@/services/projectService';

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
  const projectId = useEditorStore((state) => state.projectId);
  const projectName = useEditorStore((state) => state.projectName);
  const composition = useEditorStore((state) => state.composition);
  const isCommitting = useEditorStore((state) => state.isCommitting);
  const canExport = Boolean(projectId && composition.length > 0 && !isCommitting);

  const exportAs = useCallback(
    async (format: ExportFormat) => {
      if (!projectId || isExporting || isCommitting) return;
      setIsExporting(true);
      setExportProgress('正在创建持久化导出任务...');
      try {
        const artifact = await exportProject(projectId, format, (job) => {
          setExportProgress(
            `${job.phase || '处理中'} · ${Math.round(job.progress * 100)}%`
          );
        });
        const link = document.createElement('a');
        link.href = artifact.downloadUrl;
        link.download = `${projectName || 'voxflow'}_edited.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setExportProgress('导出完成');
      } catch (error) {
        console.error('Export error:', error);
        setExportProgress('');
        alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setIsExporting(false);
        window.setTimeout(() => setExportProgress(''), 3000);
      }
    },
    [projectId, projectName, isExporting, isCommitting]
  );

  return { isExporting, exportProgress, canExport, exportAs };
}
