import React from 'react';

interface MainLayoutProps {
  children: React.ReactNode;
  chatPanel?: React.ReactNode;
}

/**
 * 主布局组件
 *
 * 两栏布局：
 * - 左侧：主内容区域（flex-1）
 * - 右侧：对话框面板（固定宽度 380px）
 *
 * 布局特性：
 * - 最大宽度 1600px，居中显示
 * - 使用 CSS 变量实现主题切换
 * - 右侧面板粘性定位
 */
export const MainLayout: React.FC<MainLayoutProps> = ({ children, chatPanel }) => {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="flex gap-5">
        {/* 左侧主内容区 */}
        <div className="flex-1 min-w-0">{children}</div>

        {/* 右侧对话框面板 */}
        {chatPanel && (
          <div className="w-[380px] flex-shrink-0 sticky top-6 h-[calc(100vh-120px)]">
            {chatPanel}
          </div>
        )}
      </div>
    </div>
  );
};
