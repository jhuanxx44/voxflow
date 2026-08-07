/**
 * FunASR Audio Editor - Main Application Component
 *
 * Features:
 * - Audio file selection and playback
 * - ASR recognition with basic/advanced modes
 * - Recognition result display with multiple display modes
 * - Non-destructive editing (delete, reorder via drag-and-drop)
 * - LLM chat assistant
 * - Materials library and admin management
 * - Theme switching (dark/light)
 */

import { useEffect, useRef, useCallback } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Header } from './components/layout/Header';
import { Card } from './components/layout/Card';
import { MediaPlayerWithRef } from './components/media/MediaPlayer';
import { FileSelector } from './components/audio/FileSelector';
import { RecognitionSettings } from './components/audio/RecognitionSettings';
import { ResultCard } from './components/result/ResultCard';
import { SegmentsTable } from './components/result/SegmentsTable';
import { DebugInfo } from './components/result/DebugInfo';
import { ChatPanel } from './components/chat/ChatPanel';
import { MaterialsModal } from './components/modals/MaterialsModal';
import { AdminModal } from './components/modals/AdminModal';
import { ContextMenu } from './components/common/ContextMenu';
import { Button } from './components/common/Button';
import { useASRStore } from './stores/asrStore';
import { useEditorStore } from './stores/editorStore';
import { useUIStore } from './stores/uiStore';
import { useASRRecognition } from './hooks/useASRRecognition';
import { useServerStatus } from './hooks/useServerStatus';
import { useComposition } from './hooks/useComposition';

function App() {
  // Use HTMLMediaElement to support both audio and video
  const mediaRef = useRef<HTMLMediaElement>(null);

  // Stores
  const {
    isRecognizing,
    currentFile,
    currentMaterial,
    setAudioUrl,
    setMediaType,
  } = useASRStore();
  const {
    lastSegments,
    isCharEditMode,
    setInlineEditIndex,
    projectId,
    loadProject,
  } = useEditorStore();
  const hasAudioSource = currentFile !== null || currentMaterial !== null || projectId !== null;

  // Debug: log lastSegments
  useEffect(() => {
    console.log('App: lastSegments changed, length:', lastSegments?.length);
  }, [lastSegments]);
  const {
    contextMenu,
    hideContextMenu,
    segmentsVisible,
    debugVisible,
    toggleSegmentsVisible,
    toggleDebugVisible,
    setMaterialsModalOpen,
    setAdminModalOpen,
  } = useUIStore();

  // Hooks
  const { performRecognition } = useASRRecognition({
    onSuccess: () => {
      console.log('识别成功');
    },
    onError: (err) => {
      alert(`识别失败: ${err.message}`);
    },
    onCacheHit: () => {
      console.log('从缓存加载');
    },
  });

  const { deleteAtPosition } = useComposition();

  // Initialize server status polling
  useServerStatus();

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light');
    }
  }, []);

  // Restore the last committed project after a browser refresh.
  useEffect(() => {
    if (projectId) return;
    const queryProjectId = new URLSearchParams(window.location.search).get('project');
    const savedProjectId = queryProjectId || localStorage.getItem('voxflow.currentProjectId');
    if (!savedProjectId) return;
    loadProject(savedProjectId)
      .then((snapshot) => {
        setAudioUrl(snapshot.project.source_url);
        setMediaType(snapshot.project.source.media.has_video ? 'video' : 'audio');
      })
      .catch((loadError) => {
        localStorage.removeItem('voxflow.currentProjectId');
        if (queryProjectId) {
          console.error('恢复 URL 指定的 VoxFlow project 失败:', loadError);
        } else {
          console.info('已清除不可恢复的本地 VoxFlow project 指针');
        }
      });
  }, [projectId, loadProject, setAudioUrl, setMediaType]);

  // Global undo/redo keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        useEditorStore.getState().redo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Handle recognition button click
   */
  const handleRecognize = useCallback(() => {
    if (!currentFile && !currentMaterial) {
      alert('请先选择音频文件或从素材库选择');
      return;
    }
    performRecognition();
  }, [currentFile, currentMaterial, performRecognition]);

  /**
   * Build context menu items
   */
  const getContextMenuItems = useCallback(() => {
    if (contextMenu === null) return [];

    const items = [
      {
        label: '删除此句',
        onClick: () => {
          deleteAtPosition(contextMenu.targetIndex);
        },
        danger: true,
      },
    ];

    // "编辑并重生成 (TTS)" — only in segment edit mode (not char edit mode)
    if (!isCharEditMode) {
      items.push({
        label: '编辑并重生成 (TTS)',
        onClick: () => {
          setInlineEditIndex(contextMenu.targetIndex);
        },
        danger: false,
      });
    }

    return items;
  }, [contextMenu, deleteAtPosition, isCharEditMode, setInlineEditIndex]);

  return (
    <div className="min-h-screen bg-[var(--bg-body)] text-[var(--text-primary)]">
      <MainLayout
        chatPanel={<ChatPanel />}
      >
        {/* Header */}
        <Header />

        {/* Media Section */}
        <Card title="媒体文件" className="mb-4">
          {/* Materials Library Button - Above File Selector */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setMaterialsModalOpen(true)}
              className={`
                flex-1 px-4 py-3 rounded-lg font-medium
                transition-all duration-300
                flex items-center justify-center gap-2
                ${
                  hasAudioSource
                    ? 'bg-[var(--bg-button)] text-[var(--text-primary)] border border-[var(--border-input)] hover:bg-[var(--hover-bg)]'
                    : 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:shadow-lg hover:scale-[1.02]'
                }
              `}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              从素材库选择
            </button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setAdminModalOpen(true)}
            >
              管理员
            </Button>
          </div>

          {/* File Selector */}
          <div className="mb-4">
            <FileSelector />
          </div>

          {/* Media Player - renders video or audio based on mediaType */}
          <MediaPlayerWithRef ref={mediaRef} className="mb-4" />

          {/* Recognition Settings */}
          <RecognitionSettings
            onRecognize={handleRecognize}
            isRecognizing={isRecognizing}
            hasAudioSource={hasAudioSource}
          />
        </Card>

        {/* Recognition Result Section */}
        {lastSegments.length > 0 && (
          <>
            <ResultCard audioRef={mediaRef} />

            {/* Debug Controls */}
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleSegmentsVisible}
              >
                {segmentsVisible ? '隐藏分段表' : '显示分段表'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleDebugVisible}
              >
                {debugVisible ? '隐藏调试' : '显示调试'}
              </Button>
            </div>

            {/* Segments Table */}
            {segmentsVisible && (
              <Card title="分段详情" className="mt-4">
                <SegmentsTable />
              </Card>
            )}

            {/* Debug Info */}
            {debugVisible && (
              <Card title="调试信息" className="mt-4">
                <DebugInfo />
              </Card>
            )}
          </>
        )}

        {/* Empty state */}
        {lastSegments.length === 0 && !isRecognizing && (
          <Card className="mt-4">
            <div className="text-center py-12 text-[var(--text-muted)]">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              <p className="text-lg mb-2">请选择音频/视频文件并开始识别</p>
              <p className="text-sm">
                支持拖拽上传或从素材库选择，视频将自动提取音频进行识别
              </p>
            </div>
          </Card>
        )}
      </MainLayout>

      {/* Modals */}
      <MaterialsModal />
      <AdminModal />

      {/* Context Menu */}
      <ContextMenu
        visible={contextMenu !== null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={getContextMenuItems()}
        onClose={hideContextMenu}
      />
    </div>
  );
}

export default App;
