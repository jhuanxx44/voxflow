/**
 * RecognitionSettings Component
 *
 * Settings panel for ASR recognition including mode toggle, hotwords,
 * cache control, and server status display.
 */

import React from 'react';
import { useASRStore } from '@/stores/asrStore';
import type { ServerStatus } from '@/stores/asrStore';

interface RecognitionSettingsProps {
  onRecognize?: () => void;
  isRecognizing?: boolean;
  hasAudioSource?: boolean;
  className?: string;
}

export const RecognitionSettings: React.FC<RecognitionSettingsProps> = ({
  onRecognize,
  isRecognizing = false,
  hasAudioSource = false,
  className = '',
}) => {
  const {
    hotwords,
    setHotwords,
    serverStatus,
  } = useASRStore();

  const handleHotwordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHotwords(e.target.value);
  };

  const renderServerStatus = (status: ServerStatus | null) => {
    if (!status) {
      return <span className="text-[var(--text-muted)]">🔴 找不到服务器</span>;
    }

    const totalActive = status.waiting + status.processing;

    if (totalActive === 0) {
      return <span className="text-green-400">🟢 服务器空闲</span>;
    }

    const parts: string[] = [];
    if (status.processing > 0) {
      parts.push(`处理中(${status.processing})`);
    }
    if (status.waiting > 0) {
      parts.push(`排队(${status.waiting})`);
    }

    return (
      <span className="text-yellow-400">🟡 {parts.join(' | ')}</span>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Recognition Mode Toggle - Hidden, default to advanced */}
      {/* <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={recognitionMode === 'advanced'}
            onChange={handleModeChange}
            disabled={isRecognizing}
            className="w-4 h-4 rounded border-[var(--border-input)]
                     text-[var(--highlight-color)] focus:ring-2
                     focus:ring-[var(--highlight-color)] focus:ring-offset-0
                     bg-[var(--bg-input)] cursor-pointer
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            启用高级识别（标点/VAD/说话人）
          </span>
        </label>
      </div> */}

      {/* Hotwords Input */}
      <div>
        <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
          热词配置
          <span className="font-normal text-xs text-[var(--text-muted)] ml-2">
            多个热词用空格分隔，如：阿里巴巴 魔搭 达摩院
          </span>
        </label>
        <input
          type="text"
          value={hotwords}
          onChange={handleHotwordsChange}
          placeholder="输入热词，用空格分隔"
          disabled={isRecognizing}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)]
                   bg-[var(--bg-input)] text-[var(--text-primary)]
                   placeholder:text-[var(--text-muted)]
                   focus:outline-none focus:ring-2 focus:ring-[var(--highlight-color)]
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors duration-200"
        />
      </div>

      {/* Cache is authoritative and content-addressed on the local backend. */}
      <div className="text-xs text-[var(--text-muted)]">
        识别缓存由本地服务按源媒体与识别参数自动复用
      </div>

      {/* Server Status Display */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">
          服务器状态
        </span>
        <div className="text-sm font-medium">
          {renderServerStatus(serverStatus)}
        </div>
      </div>

      {/* Recognize Button */}
      {onRecognize && (
        <div className="pt-2">
          <button
            onClick={onRecognize}
            disabled={isRecognizing || !hasAudioSource}
            className={`
              w-full px-4 py-3 rounded-lg font-medium
              transition-all duration-300
              ${
                isRecognizing || !hasAudioSource
                  ? 'bg-[var(--bg-button)] text-[var(--text-primary)] opacity-50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:shadow-lg hover:scale-105'
              }
            `}
          >
            {isRecognizing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                正在识别...
              </span>
            ) : (
              '开始识别'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
