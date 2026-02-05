/**
 * CoverGeneration Component - Renders cover generation UI
 * with style selection, generation button, image display, and download
 */

import { useState } from 'react';
import type { CoverPromptData, CoverStyle } from '@/types';

/**
 * Style options for cover generation
 */
const STYLE_OPTIONS: { value: CoverStyle; label: string }[] = [
  { value: '日式动画', label: '日式动画' },
  { value: '3D 动画', label: '3D 动画' },
  { value: '像素风格', label: '像素风格' },
  { value: '吉卜力', label: '吉卜力' },
  { value: '美式漫画', label: '美式漫画' },
];

interface CoverGenerationProps {
  promptData: CoverPromptData;
}

/**
 * Generate cover image by calling backend API
 */
async function generateCoverImage(
  prompt: string,
  style: CoverStyle
): Promise<string> {
  const response = await fetch('/generate-cover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, style }),
  });

  // 先获取响应文本
  const text = await response.text();

  if (!response.ok) {
    // 尝试解析为 JSON 获取错误信息
    try {
      const error = JSON.parse(text);
      throw new Error(error.error || `HTTP ${response.status}`);
    } catch {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`);
    }
  }

  // 解析成功响应
  try {
    const data = JSON.parse(text);
    if (!data.image_url) {
      throw new Error('响应中没有图片 URL');
    }
    return data.image_url;
  } catch (e) {
    console.error('Response parse error:', text.slice(0, 500));
    throw new Error('解析响应失败，请检查后端服务');
  }
}

/**
 * Download image from URL
 */
function downloadImage(imageUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function CoverGeneration({ promptData }: CoverGenerationProps) {
  const [selectedStyle, setSelectedStyle] = useState<CoverStyle>('日式动画');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle generate button click
   */
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const imageUrl = await generateCoverImage(promptData.prompt, selectedStyle);
      setGeneratedImage(imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试');
      console.error('Cover generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Handle download button click
   */
  const handleDownload = () => {
    if (!generatedImage) return;
    const filename = `cover_${selectedStyle}_${Date.now()}.png`;
    downloadImage(generatedImage, filename);
  };

  return (
    <div className="mt-3 p-4 rounded-lg bg-[var(--bg-text-area)] border border-[var(--border-color)]">
      {/* Summary and Keywords */}
      <div className="mb-4">
        <div className="text-xs text-[var(--text-muted)] mb-1">内容概括</div>
        <div className="text-sm font-medium text-[var(--text-primary)]">
          {promptData.summary}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {promptData.keywords.map((kw, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs rounded-full bg-[var(--highlight-color)]/15 text-[var(--highlight-color)]"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* Prompt Preview (collapsible) */}
      <details className="mb-4">
        <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
          查看生成提示词
        </summary>
        <div className="mt-2 p-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-card)] rounded border border-[var(--border-color)] font-mono whitespace-pre-wrap">
          {promptData.prompt}
        </div>
      </details>

      {/* Style Selection */}
      <div className="mb-4">
        <div className="text-xs text-[var(--text-muted)] mb-2">选择风格</div>
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((style) => (
            <button
              key={style.value}
              onClick={() => setSelectedStyle(style.value)}
              disabled={isGenerating}
              className={`
                px-3 py-1.5 text-xs rounded-full border transition-all duration-200
                ${
                  selectedStyle === style.value
                    ? 'bg-[var(--highlight-color)] text-white border-[var(--highlight-color)]'
                    : 'bg-transparent text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--highlight-color)] hover:text-[var(--highlight-color)]'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="
          w-full py-2.5 rounded-lg text-sm font-medium
          bg-[var(--highlight-color)] text-white
          hover:opacity-90
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          flex items-center justify-center gap-2
        "
      >
        {isGenerating ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            生成中...（约10-30秒）
          </>
        ) : generatedImage ? (
          '重新生成'
        ) : (
          '生成封面'
        )}
      </button>

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Generated Image */}
      {generatedImage && (
        <div className="mt-4">
          <div className="relative rounded-lg overflow-hidden border border-[var(--border-color)] shadow-lg">
            <img
              src={generatedImage}
              alt="Generated Cover"
              className="w-full aspect-video object-cover"
            />
          </div>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="
              mt-3 w-full py-2.5 rounded-lg text-sm font-medium
              bg-green-500/15 text-green-500 border border-green-500/30
              hover:bg-green-500 hover:text-white
              transition-all duration-200
              flex items-center justify-center gap-2
            "
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            下载封面
          </button>
        </div>
      )}
    </div>
  );
}
