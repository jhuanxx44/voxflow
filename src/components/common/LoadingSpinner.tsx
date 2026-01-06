import React from 'react';

interface LoadingSpinnerProps {
  text?: string;
  showDots?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 加载动画组件
 *
 * 功能：
 * - 炫彩彩虹圆环旋转动画
 * - 可选的加载文字
 * - 跳动的省略号动画
 * - 多种尺寸选择
 *
 * @param text - 加载提示文字
 * @param showDots - 是否显示跳动的省略号，默认 true
 * @param size - 加载器尺寸，默认 'md'
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  text,
  showDots = true,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      {/* 彩虹旋转圆环 */}
      <span className={`loading-spinner ${sizeClasses[size]}`} />

      {/* 加载文字 */}
      {text && (
        <span className="text-[var(--text-muted)] text-sm">
          {text}
          {showDots && (
            <span className="loading-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          )}
        </span>
      )}
    </span>
  );
};
