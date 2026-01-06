/**
 * Admin Modal Component - Manages materials library administration
 *
 * Features:
 * - Password-protected admin operations
 * - Upload new materials to server
 * - Delete existing materials
 * - Material list with delete buttons
 * - Password validation before actions
 * - Success/error feedback
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useUIStore } from '@/stores/uiStore';
import type { Material } from '@/types/materials';
import {
  getMaterials,
  uploadMaterial,
  deleteMaterial,
  formatFileSize
} from '@/services/materialsService';

export const AdminModal: React.FC = () => {
  const adminModalOpen = useUIStore(state => state.adminModalOpen);
  const setAdminModalOpen = useUIStore(state => state.setAdminModalOpen);

  const [password, setPassword] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load materials when modal opens
  useEffect(() => {
    if (adminModalOpen) {
      loadMaterialsList();
    }
  }, [adminModalOpen]);

  // Clear messages after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

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
      setError('加载素材列表失败');
      console.error('Failed to load materials:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles file selection for upload
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setError(null);
      setSuccessMessage(null);
    }
  };

  /**
   * Handles material upload
   */
  const handleUpload = async () => {
    if (!uploadFile) {
      setError('请选择要上传的文件');
      return;
    }

    if (!password.trim()) {
      setError('请输入管理员密码');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await uploadMaterial(uploadFile, password);

      if (result.success || result.message) {
        setSuccessMessage(result.message || '上传成功');
        setUploadFile(null);
        // Reset file input
        const fileInput = document.getElementById('admin-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        // Reload materials list
        await loadMaterialsList();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '上传失败';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handles material deletion
   */
  const handleDelete = async (filename: string) => {
    if (!password.trim()) {
      setError('请先输入管理员密码');
      return;
    }

    if (!confirm(`确定要删除素材 "${filename}" 吗？`)) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      const result = await deleteMaterial(filename, password);

      if (result.success || result.message) {
        setSuccessMessage(result.message || '删除成功');
        // Reload materials list
        await loadMaterialsList();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除失败';
      setError(errorMessage);
    }
  };

  /**
   * Closes the modal
   */
  const handleClose = () => {
    setAdminModalOpen(false);
    // Clear form on close
    setPassword('');
    setUploadFile(null);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <Modal
      isOpen={adminModalOpen}
      onClose={handleClose}
      title="管理员"
      size="md"
    >
      {/* Password section */}
      <div className="mb-6">
        <label className="block text-[var(--text-primary)] text-sm font-medium mb-2">
          管理员密码
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入管理员密码"
          className="
            w-full px-4 py-2.5
            bg-[var(--bg-input)]
            border border-[var(--border-input)]
            rounded-lg
            text-[var(--text-primary)]
            placeholder-[var(--text-muted)]
            focus:outline-none focus:border-[#667eea]
            transition-colors duration-200
          "
        />
      </div>

      {/* Upload section */}
      <div className="mb-6 p-4 bg-[var(--bg-input)] rounded-lg border border-[var(--border-input)]">
        <h4 className="text-[var(--text-primary)] font-medium mb-3">
          上传新素材
        </h4>

        <div className="space-y-3">
          <input
            id="admin-file-input"
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="
              w-full
              text-[var(--text-primary)]
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-medium
              file:bg-[var(--bg-button)]
              file:text-[var(--text-primary)]
              file:cursor-pointer
              hover:file:opacity-80
            "
          />

          {uploadFile && (
            <div className="text-[var(--text-muted)] text-sm">
              已选择: {uploadFile.name} ({formatFileSize(uploadFile.size)})
            </div>
          )}

          <Button
            onClick={handleUpload}
            loading={uploading}
            disabled={!uploadFile || uploading}
            variant="primary"
            className="w-full"
          >
            {uploading ? '上传中...' : '上传'}
          </Button>
        </div>
      </div>

      {/* Success/Error messages */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-500/20 border border-green-500 rounded-lg">
          <p className="text-green-500 text-sm">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {/* Materials list section */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-[var(--text-primary)] font-medium">
            素材列表
          </h4>
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
          <div className="flex justify-center py-8">
            <LoadingSpinner text="加载中" size="md" />
          </div>
        )}

        {/* Empty state */}
        {!loading && materials.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[var(--text-muted)] text-sm">暂无素材</p>
          </div>
        )}

        {/* Materials list */}
        {!loading && materials.length > 0 && (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {materials.map((material) => (
              <div
                key={material.name}
                className="
                  flex items-center justify-between
                  p-3 rounded-lg border border-[var(--border-input)]
                  bg-[var(--bg-card)]
                "
              >
                {/* Material info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[var(--text-primary)] text-sm font-medium truncate mb-1">
                    {material.name}
                  </div>
                  <div className="text-[var(--text-muted)] text-xs">
                    {formatFileSize(material.size)}
                  </div>
                </div>

                {/* Delete button */}
                <Button
                  onClick={() => handleDelete(material.name)}
                  variant="danger"
                  size="sm"
                  className="ml-3"
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      {!loading && materials.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
          <p className="text-[var(--text-muted)] text-xs text-center">
            删除素材需要管理员密码确认
          </p>
        </div>
      )}
    </Modal>
  );
};
