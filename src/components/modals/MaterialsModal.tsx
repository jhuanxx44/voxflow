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
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useUIStore } from '@/stores/uiStore';
import { useASRStore } from '@/stores/asrStore';
import type { Material } from '@/types/materials';
import {
  getMaterials,
  getMaterialDownloadUrl,
  formatFileSize
} from '@/services/materialsService';

export const MaterialsModal: React.FC = () => {
  const materialsModalOpen = useUIStore(state => state.materialsModalOpen);
  const setMaterialsModalOpen = useUIStore(state => state.setMaterialsModalOpen);
  const setCurrentMaterial = useASRStore(state => state.setCurrentMaterial);
  const setAudioUrl = useASRStore(state => state.setAudioUrl);

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
    // Set the current material in ASR store
    setCurrentMaterial(material.name);

    // Set audio URL for preview
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
            点击素材进行选择，选择后可进行语音识别
          </p>
        </div>
      )}
    </Modal>
  );
};
