/**
 * FileSelector Component
 *
 * Media file selector with drag-and-drop support.
 * Supports both audio and video files.
 * Shows selected file name and integrates with asrStore.
 */

import React, { useRef, useState, useCallback } from 'react';
import { useASRStore, MediaType } from '@/stores/asrStore';
import { useEditorStore } from '@/stores/editorStore';

// 视频文件扩展名（与后端保持一致）
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp']);

/**
 * 根据文件名判断媒体类型
 */
function getMediaTypeFromFile(filename: string): MediaType {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio';
}

interface FileSelectorProps {
  onFileSelect?: (file: File) => void;
  className?: string;
}

export const FileSelector: React.FC<FileSelectorProps> = ({
  onFileSelect,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { currentFile, currentMaterial, mediaType, setCurrentFile, setAudioUrl, setMediaType, clearCurrentAudio } = useASRStore();
  const { clearAll } = useEditorStore();

  // Check if there's any audio source selected
  const hasAudioSource = currentFile !== null || currentMaterial !== null;

  const handleFileChange = useCallback(
    (file: File | null) => {
      if (file) {
        // Validate file type - accept both audio and video
        const isAudio = file.type.startsWith('audio/');
        const isVideo = file.type.startsWith('video/');
        if (!isAudio && !isVideo) {
          alert('请选择音频或视频文件');
          return;
        }

        // Determine media type from filename
        const detectedMediaType = getMediaTypeFromFile(file.name);
        setMediaType(detectedMediaType);

        // Create media URL
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        setCurrentFile(file);
        onFileSelect?.(file);
      } else {
        setCurrentFile(null);
        setAudioUrl(null);
        setMediaType('audio');
      }
    },
    [setCurrentFile, setAudioUrl, setMediaType, onFileSelect]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFileChange(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileChange(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Clear both file and material
    clearCurrentAudio();
    // Clear editor state (recognition results)
    clearAll();
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {/* Hidden file input - accept both audio and video */}
        <input
          ref={fileInputRef}
          id="file"
          type="file"
          accept="audio/*,video/*"
          onChange={handleInputChange}
          className="hidden"
        />

        {/* Drag-and-drop zone */}
        <div
          onClick={handleClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`
            flex-1 px-4 py-3 rounded-lg border-2 border-dashed
            cursor-pointer transition-all duration-200
            ${
              isDragging
                ? 'border-[var(--highlight-color)] bg-[var(--hover-bg)]'
                : 'border-[var(--border-input)] hover:border-[var(--highlight-color)]'
            }
          `}
        >
          <div className="flex items-center gap-3">
            {/* Icon changes based on media type */}
            {mediaType === 'video' ? (
              <svg
                className="w-5 h-5 text-[var(--text-secondary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-[var(--text-secondary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            )}

            <div className="flex-1">
              {currentFile ? (
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {currentFile.name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {(currentFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              ) : currentMaterial ? (
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {currentMaterial}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    来自素材库
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">
                  {isDragging
                    ? '松开以上传文件'
                    : '点击选择或拖拽音频/视频文件到此处'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clear button - show when file or material is selected */}
        {hasAudioSource && (
          <button
            onClick={handleClear}
            className="px-3 py-2 rounded-lg border border-[var(--border-input)]
                     bg-[var(--bg-button)] text-[var(--text-primary)]
                     hover:bg-[var(--hover-bg)] transition-colors duration-200"
          >
            清空
          </button>
        )}
      </div>
    </div>
  );
};
