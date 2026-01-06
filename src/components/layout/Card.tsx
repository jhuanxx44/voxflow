import React, { useState } from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  className?: string;
  headerExtra?: React.ReactNode;
}

/**
 * 卡片容器组件
 *
 * 功能：
 * - 提供统一的卡片样式容器
 * - 可选的折叠/展开功能
 * - 支持自定义头部额外内容
 * - 使用 CSS 变量适配主题
 *
 * @param title - 卡片标题
 * @param children - 卡片内容
 * @param collapsible - 是否可折叠
 * @param defaultCollapsed - 默认是否折叠
 * @param onToggle - 折叠状态变化回调
 * @param className - 额外的 CSS 类名
 * @param headerExtra - 头部右侧额外内容
 */
export const Card: React.FC<CardProps> = ({
  title,
  children,
  collapsible = false,
  defaultCollapsed = false,
  onToggle,
  className = '',
  headerExtra,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onToggle?.(newCollapsed);
  };

  return (
    <div
      className={`bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 transition-all duration-300 ${className}`}
    >
      {/* 卡片头部 */}
      {(title || collapsible || headerExtra) && (
        <div className="flex justify-between items-center mb-3">
          {title && (
            <div className="text-sm text-[var(--text-secondary)] font-semibold">
              {title}
            </div>
          )}

          <div className="flex items-center gap-2">
            {headerExtra}

            {collapsible && (
              <button
                onClick={handleToggle}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-input)] bg-[var(--bg-button)] text-[var(--text-primary)] cursor-pointer transition-all duration-300 hover:opacity-80"
              >
                {collapsed ? '显示' : '隐藏'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 卡片内容 */}
      {!collapsed && <div>{children}</div>}
    </div>
  );
};
