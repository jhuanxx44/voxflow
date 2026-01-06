import { useEffect, useState } from 'react';

/**
 * 主题类型
 */
export type Theme = 'dark' | 'light';

/**
 * 主题管理自定义 Hook
 *
 * 功能：
 * - 从 localStorage 读取并初始化主题
 * - 提供主题切换功能
 * - 自动同步到 DOM 和 localStorage
 *
 * @returns {{ theme: Theme, toggleTheme: () => void }}
 */
export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    // 从 localStorage 读取主题，默认为 dark
    const saved = localStorage.getItem('theme');
    return (saved === 'light' ? 'light' : 'dark') as Theme;
  });

  useEffect(() => {
    // 初始化时应用主题到 DOM
    applyTheme(theme);
  }, []);

  /**
   * 应用主题到 DOM 和 localStorage
   */
  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;

    if (newTheme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }

    localStorage.setItem('theme', newTheme);
  };

  /**
   * 切换主题
   */
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return {
    theme,
    toggleTheme,
  };
};
