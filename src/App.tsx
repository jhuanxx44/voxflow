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
import { AudioPlayer, AudioPlayerWithRef } from './components/audio/AudioPlayer';
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
  const audioRef = useRef<HTMLAudioElement>(null);

  // Stores
  const { isRecognizing, currentFile, currentMaterial } = useASRStore();
  const { lastSegments } = useEditorStore();

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
  const { performRecognition, error: recognitionError } = useASRRecognition({
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

    return [
      {
        label: '删除此句',
        onClick: () => {
          deleteAtPosition(contextMenu.targetIndex);
        },
        danger: true,
      },
    ];
  }, [contextMenu, deleteAtPosition]);

  return (
    <div className="min-h-screen bg-[var(--bg-body)] text-[var(--text-primary)]">
      <MainLayout
        chatPanel={<ChatPanel />}
      >
        {/* Header */}
        <Header />

        {/* Audio Section */}
        <Card title="音频文件" className="mb-4">
          {/* File Selector and Quick Actions */}
          <div className="flex items-start gap-2 mb-4">
            <div className="flex-1">
              <FileSelector />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMaterialsModalOpen(true)}
            >
              素材库
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdminModalOpen(true)}
            >
              管理员
            </Button>
          </div>

          {/* Audio Player */}
          <AudioPlayerWithRef ref={audioRef} className="mb-4" />

          {/* Recognition Settings */}
          <RecognitionSettings
            onRecognize={handleRecognize}
            isRecognizing={isRecognizing}
          />
        </Card>

        {/* Recognition Result Section */}
        {lastSegments.length > 0 && (
          <>
            <ResultCard audioRef={audioRef} />

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
              <p className="text-lg mb-2">请选择音频文件并开始识别</p>
              <p className="text-sm">
                支持拖拽上传或从素材库选择
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
