import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

/**
 * 通用按钮组件
 *
 * 功能：
 * - 支持多种样式变体（primary, secondary, danger）
 * - 支持多种尺寸（sm, md, lg）
 * - 加载状态显示
 * - 禁用状态样式
 *
 * @param variant - 按钮样式变体，默认 'secondary'
 * @param size - 按钮尺寸，默认 'md'
 * @param loading - 是否显示加载状态
 * @param disabled - 是否禁用
 * @param children - 按钮内容
 * @param className - 额外的 CSS 类名
 * @param onClick - 点击事件处理
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  className = '',
  onClick,
  ...rest
}) => {
  // 基础样式
  const baseStyles =
    'rounded-lg border transition-all duration-300 ease-in-out cursor-pointer font-medium';

  // 尺寸样式
  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  };

  // 变体样式
  const variantStyles = {
    primary:
      'bg-gradient-to-br from-[#667eea] to-[#764ba2] border-[#667eea] text-white shadow-[0_0_20px_rgba(102,126,234,0.6)] hover:shadow-[0_0_30px_rgba(102,126,234,0.9)] transform hover:scale-105',
    secondary:
      'bg-[var(--bg-button)] border-[var(--border-input)] text-[var(--text-primary)] hover:opacity-80',
    danger:
      'bg-red-600 border-red-700 text-white hover:bg-red-700 hover:border-red-800',
  };

  // 禁用/加载状态样式
  const disabledStyles = 'opacity-50 cursor-not-allowed hover:scale-100 hover:opacity-50';

  const isDisabled = disabled || loading;

  const buttonClasses = `
    ${baseStyles}
    ${sizeStyles[size]}
    ${variantStyles[variant]}
    ${isDisabled ? disabledStyles : ''}
    ${className}
  `.trim();

  return (
    <button
      className={buttonClasses}
      disabled={isDisabled}
      onClick={onClick}
      {...rest}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
      )}
      {children}
    </button>
  );
};
