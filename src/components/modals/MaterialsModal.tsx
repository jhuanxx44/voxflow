/**
 * Materials Modal Component - Displays and manages the materials library
 *
 * Features:
 * - Lists all available materials from server
 * - Shows filename and file size for each material
 * - Click to select material for recognition
 * - Download button for each material
 * - Refresh button to reload list
 * - Loading states and error handling
 * - Supports both audio and video files
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useUIStore } from '@/stores/uiStore';
import { useASRStore, MediaType } from '@/stores/asrStore';
import type { Material } from '@/types/materials';
import {
  getMaterials,
  getMaterialDownloadUrl,
  formatFileSize
} from '@/services/materialsService';

// 视频文件扩展名（与后端保持一致）
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp']);

/**
 * 根据文件名判断媒体类型
 */
function getMediaTypeFromFilename(filename: string): MediaType {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio';
}

export const MaterialsModal: React.FC = () => {
  const materialsModalOpen = useUIStore(state => state.materialsModalOpen);
  const setMaterialsModalOpen = useUIStore(state => state.setMaterialsModalOpen);
  const setCurrentMaterial = useASRStore(state => state.setCurrentMaterial);
  const setAudioUrl = useASRStore(state => state.setAudioUrl);
  const setMediaType = useASRStore(state => state.setMediaType);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);

  // Load materials when modal opens
  useEffect(() => {
    if (materialsModalOpen) {
      loadMaterialsList();
    }
  }, [materialsModalOpen]);

  /**
   * Loads the materials list from server
   */
  const loadMaterialsList = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getMaterials();
      setMaterials(data);
    } catch (err) {
      setError('加载素材列表失败，请稍后重试');
      console.error('Failed to load materials:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles material selection
   */
  const handleSelectMaterial = (material: Material) => {
    // Determine media type from filename
    const detectedMediaType = getMediaTypeFromFilename(material.name);
    setMediaType(detectedMediaType);

    // Set the current material in ASR store
    setCurrentMaterial(material.name);

    // Set media URL for preview
    setAudioUrl(material.url);

    // Highlight the selected material
    setSelectedMaterial(material.name);

    // Close the modal
    setMaterialsModalOpen(false);
  };

  /**
   * Handles material download
   */
  const handleDownloadMaterial = (material: Material, e: React.MouseEvent) => {
    // Prevent triggering selection when clicking download
    e.stopPropagation();

    // Open download link in new tab
    window.open(material.url, '_blank');
  };

  /**
   * Closes the modal
   */
  const handleClose = () => {
    setMaterialsModalOpen(false);
  };

  return (
    <Modal
      isOpen={materialsModalOpen}
      onClose={handleClose}
      title="素材库"
      size="md"
    >
      {/* Refresh button */}
      <div className="flex justify-end mb-4">
        <Button
          onClick={loadMaterialsList}
          disabled={loading}
          size="sm"
          variant="secondary"
        >
          {loading ? '刷新中...' : '刷新'}
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner text="加载素材库" size="lg" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={loadMaterialsList} variant="secondary">
            重试
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && materials.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--text-muted)] text-sm">
            素材库为空
          </p>
        </div>
      )}

      {/* Materials list */}
      {!loading && !error && materials.length > 0 && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {materials.map((material) => (
            <div
              key={material.name}
              onClick={() => handleSelectMaterial(material)}
              className={`
                flex items-center justify-between
                p-4 rounded-lg border
                transition-all duration-200
                cursor-pointer
                hover:bg-[var(--bg-hover)]
                ${
                  selectedMaterial === material.name
                    ? 'border-[#667eea] bg-[var(--bg-hover)]'
                    : 'border-[var(--border-input)]'
                }
              `}
            >
              {/* Media type icon */}
              <div className="mr-3 text-[var(--text-secondary)]">
                {getMediaTypeFromFilename(material.name) === 'video' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                )}
              </div>

              {/* Material info */}
              <div className="flex-1 min-w-0">
                <div className="text-[var(--text-primary)] font-medium truncate mb-1">
                  {material.name}
                </div>
                <div className="text-[var(--text-muted)] text-xs">
                  {formatFileSize(material.size)}
                  <span className="mx-2">•</span>
                  {material.uploaded_at}
                </div>
              </div>

              {/* Download button */}
              <Button
                onClick={(e) => handleDownloadMaterial(material, e)}
                variant="secondary"
                size="sm"
                className="ml-4"
              >
                下载
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Footer info */}
      {!loading && !error && materials.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
          <p className="text-[var(--text-muted)] text-xs text-center">
            点击素材进行选择。支持音频和视频，视频将自动提取音频进行识别
          </p>
        </div>
      )}
    </Modal>
  );
};
