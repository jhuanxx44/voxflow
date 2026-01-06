import React, { useEffect } from 'react';

type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

/**
 * 模态框组件
 *
 * 功能：
 * - 全屏遮罩层
 * - 可自定义尺寸（sm, md, lg）
 * - 点击遮罩层关闭
 * - ESC 键关闭
 * - 滚动内容支持
 *
 * @param isOpen - 是否打开模态框
 * @param onClose - 关闭回调函数
 * @param title - 模态框标题
 * @param children - 模态框内容
 * @param size - 模态框尺寸，默认 'md'
 * @param closeOnOverlayClick - 点击遮罩层是否关闭，默认 true
 * @param closeOnEscape - ESC 键是否关闭，默认 true
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
}) => {
  // 尺寸映射
  const sizeStyles = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
  };

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // 防止页面滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // 遮罩层点击处理
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[var(--modal-overlay)] transition-opacity duration-300"
      onClick={handleOverlayClick}
    >
      {/* 模态框内容 */}
      <div
        className={`
          bg-[var(--bg-card)]
          border border-[var(--border-input)]
          rounded-xl
          w-[90%]
          ${sizeStyles[size]}
          max-h-[80vh]
          overflow-y-auto
          shadow-2xl
          transition-transform duration-300
          transform scale-100
        `}
      >
        {/* 头部 */}
        {title && (
          <div className="flex justify-between items-center p-5 border-b border-[var(--border-color)]">
            <h3 className="text-lg font-bold text-[var(--text-primary)] m-0">{title}</h3>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-3xl font-bold leading-none cursor-pointer transition-colors duration-200 bg-transparent border-0"
              aria-label="关闭"
            >
              &times;
            </button>
          </div>
        )}

        {/* 内容 */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};
