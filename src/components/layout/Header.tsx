import React from 'react';
import { useTheme } from '../../hooks/useTheme';

/**
 * 页面头部组件
 *
 * 功能：
 * - 显示应用标题："基于文本的智能编辑"
 * - 提供主题切换按钮（日/月图标）
 * - 使用 useTheme Hook 管理主题状态
 */
export const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex justify-between items-center mb-5">
      <h2 className="m-0 text-[var(--text-primary)] text-2xl font-semibold">
        VoxFlow - 基于文本的多模态编辑器
      </h2>

      <button
        onClick={toggleTheme}
        className="px-3 py-2 text-sm rounded-lg border border-[var(--border-input)] bg-[var(--bg-button)] text-[var(--text-primary)] cursor-pointer transition-all duration-300 hover:opacity-80"
        aria-label="切换主题"
      >
        {theme === 'dark' ? (
          // 太阳图标（深色模式显示，点击切换到浅色）
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ) : (
          // 月亮图标（浅色模式显示，点击切换到深色）
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        )}
      </button>
    </div>
  );
};
