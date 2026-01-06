import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * 右键菜单组件
 *
 * 功能：
 * - 在指定坐标位置显示菜单
 * - 支持危险操作样式（红色高亮）
 * - 点击外部自动关闭
 * - ESC 键关闭
 *
 * @param visible - 是否显示菜单
 * @param x - 菜单横坐标
 * @param y - 菜单纵坐标
 * @param items - 菜单项列表
 * @param onClose - 关闭回调
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  visible,
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // 延迟添加监听器，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [visible, onClose]);

  // ESC 键关闭
  useEffect(() => {
    if (!visible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [visible, onClose]);

  // 调整菜单位置，防止超出视口
  useEffect(() => {
    if (!visible || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 横向超出，向左调整
    if (rect.right > viewportWidth) {
      menu.style.left = `${viewportWidth - rect.width - 10}px`;
    }

    // 纵向超出，向上调整
    if (rect.bottom > viewportHeight) {
      menu.style.top = `${viewportHeight - rect.height - 10}px`;
    }
  }, [visible, x, y]);

  if (!visible) return null;

  const handleItemClick = (item: ContextMenuItem) => {
    item.onClick();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[var(--bg-card)] border border-[var(--border-input)] rounded-lg p-1.5 shadow-lg min-w-[150px]"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => handleItemClick(item)}
          className={`
            w-full px-2.5 py-1.5 text-left text-sm rounded-md
            border border-[var(--border-input)]
            transition-all duration-200
            ${
              item.danger
                ? 'text-red-500 hover:bg-red-500 hover:text-white hover:border-red-600'
                : 'text-[var(--text-primary)] bg-[var(--bg-button)] hover:bg-[var(--hover-bg)]'
            }
          `}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
