import React, { useState, useCallback, useEffect, useRef } from 'react';

interface MainLayoutProps {
  children: React.ReactNode;
  chatPanel?: React.ReactNode;
}

// 左侧主内容区的默认宽度和限制
const DEFAULT_MAIN_WIDTH = 1000;
const MIN_MAIN_WIDTH = 600;
const MAX_MAIN_WIDTH = 1400;
const MAIN_WIDTH_STORAGE_KEY = 'voxflow-main-content-width';

// 右侧对话框的默认宽度和限制
const DEFAULT_PANEL_WIDTH = 456;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;
const PANEL_WIDTH_STORAGE_KEY = 'voxflow-chat-panel-width';

// 布局常量
const PADDING = 48; // px-6 = 24px * 2
const GAP = 20;     // gap-5 = 20px

/**
 * 主布局组件
 *
 * 两栏布局：
 * - 左侧：主内容区域（可通过右边框拖拽调整宽度）
 * - 右侧：对话框面板（可通过右边框拖拽调整宽度）
 *
 * 布局特性：
 * - 两个区域的宽度独立调整，互不影响
 * - 总宽度不超过浏览器宽度，拖拽时实时限制
 * - UI 居中显示
 * - 使用 CSS 变量实现主题切换
 * - 右侧面板粘性定位
 */
export const MainLayout: React.FC<MainLayoutProps> = ({ children, chatPanel }) => {
  // 窗口宽度监听
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 计算可用宽度
  const availableWidth = windowWidth - PADDING - GAP;

  // 用 ref 跟踪当前宽度，用于自动调整时读取
  const mainWidthRef = useRef(DEFAULT_MAIN_WIDTH);
  const panelWidthRef = useRef(DEFAULT_PANEL_WIDTH);

  // 从 localStorage 读取保存的宽度
  const [mainWidth, setMainWidth] = useState(() => {
    const saved = localStorage.getItem(MAIN_WIDTH_STORAGE_KEY);
    if (saved) {
      const width = parseInt(saved, 10);
      if (!isNaN(width) && width >= MIN_MAIN_WIDTH && width <= MAX_MAIN_WIDTH) {
        mainWidthRef.current = width;
        return width;
      }
    }
    return DEFAULT_MAIN_WIDTH;
  });

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    if (saved) {
      const width = parseInt(saved, 10);
      if (!isNaN(width) && width >= MIN_PANEL_WIDTH && width <= MAX_PANEL_WIDTH) {
        panelWidthRef.current = width;
        return width;
      }
    }
    return DEFAULT_PANEL_WIDTH;
  });

  // 同步 ref
  useEffect(() => {
    mainWidthRef.current = mainWidth;
  }, [mainWidth]);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  // 当窗口缩小导致总宽度超出时，等比例缩小两个区域
  useEffect(() => {
    const currentMain = mainWidthRef.current;
    const currentPanel = panelWidthRef.current;
    const totalWidth = currentMain + currentPanel;

    if (totalWidth > availableWidth) {
      // 计算可缩减的空间
      const mainReducible = currentMain - MIN_MAIN_WIDTH;
      const panelReducible = currentPanel - MIN_PANEL_WIDTH;
      const totalReducible = mainReducible + panelReducible;
      const excess = totalWidth - availableWidth;

      if (totalReducible > 0 && excess > 0) {
        // 按可缩减比例分配
        const mainReduction = Math.min(mainReducible, Math.floor(excess * (mainReducible / totalReducible)));
        const panelReduction = Math.min(panelReducible, excess - mainReduction);

        const newMainWidth = currentMain - mainReduction;
        const newPanelWidth = currentPanel - panelReduction;

        if (newMainWidth !== currentMain) {
          setMainWidth(newMainWidth);
        }
        if (newPanelWidth !== currentPanel) {
          setPanelWidth(newPanelWidth);
        }
      }
    }
  }, [availableWidth]);

  const [isResizing, setIsResizing] = useState(false);
  const [resizeTarget, setResizeTarget] = useState<'main' | 'panel' | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 保存宽度到 localStorage
  useEffect(() => {
    localStorage.setItem(MAIN_WIDTH_STORAGE_KEY, mainWidth.toString());
  }, [mainWidth]);

  useEffect(() => {
    localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, panelWidth.toString());
  }, [panelWidth]);

  /**
   * 开始拖拽调整主内容区宽度
   */
  const handleMouseDownMain = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeTarget('main');
  }, []);

  /**
   * 开始拖拽调整对话框宽度
   */
  const handleMouseDownPanel = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeTarget('panel');
  }, []);

  /**
   * 拖拽过程中调整宽度
   * 使用动态最大宽度限制，确保总宽度不超过可用宽度
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      if (resizeTarget === 'main' && mainRef.current) {
        const mainRect = mainRef.current.getBoundingClientRect();
        // 主内容区宽度：鼠标位置 - 左边界
        const newWidth = e.clientX - mainRect.left;
        // 动态最大宽度：可用宽度 - 对话框当前宽度
        const dynamicMax = Math.min(MAX_MAIN_WIDTH, availableWidth - panelWidth);
        const clampedWidth = Math.max(MIN_MAIN_WIDTH, Math.min(dynamicMax, newWidth));
        setMainWidth(clampedWidth);
      } else if (resizeTarget === 'panel' && panelRef.current) {
        const panelRect = panelRef.current.getBoundingClientRect();
        // 对话框宽度：鼠标位置 - 左边界
        const newWidth = e.clientX - panelRect.left;
        // 动态最大宽度：可用宽度 - 主内容区当前宽度
        const dynamicMax = Math.min(MAX_PANEL_WIDTH, availableWidth - mainWidth);
        const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(dynamicMax, newWidth));
        setPanelWidth(clampedWidth);
      }
    },
    [isResizing, resizeTarget, availableWidth, mainWidth, panelWidth]
  );

  /**
   * 停止拖拽
   */
  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    setResizeTarget(null);
  }, []);

  // 绑定全局鼠标事件
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // 拖拽时禁止选择文本
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="w-full px-6 py-6 overflow-hidden">
      <div className="flex gap-5 justify-center">
        {/* 左侧主内容区 */}
        <div
          ref={mainRef}
          className="flex-shrink-0 flex"
          style={{ width: mainWidth }}
        >
          <div className="flex-1 min-w-0">{children}</div>
          {/* 右侧拖拽把手 */}
          <div
            onMouseDown={handleMouseDownMain}
            className={`
              w-1 flex-shrink-0 cursor-ew-resize
              bg-transparent hover:bg-[var(--highlight-color)]
              transition-colors duration-150
              ${isResizing && resizeTarget === 'main' ? 'bg-[var(--highlight-color)]' : ''}
            `}
            title="拖拽调整宽度"
          />
        </div>

        {/* 右侧对话框面板 */}
        {chatPanel && (
          <div
            ref={panelRef}
            className="flex-shrink-0 sticky top-6 h-[calc(100vh-120px)] flex"
            style={{ width: panelWidth }}
          >
            {/* 对话框内容 */}
            <div className="flex-1 min-w-0">{chatPanel}</div>
            {/* 右侧拖拽把手 */}
            <div
              onMouseDown={handleMouseDownPanel}
              className={`
                w-1 flex-shrink-0 cursor-ew-resize
                bg-transparent hover:bg-[var(--highlight-color)]
                transition-colors duration-150
                ${isResizing && resizeTarget === 'panel' ? 'bg-[var(--highlight-color)]' : ''}
              `}
              title="拖拽调整宽度"
            />
          </div>
        )}
      </div>
    </div>
  );
};
