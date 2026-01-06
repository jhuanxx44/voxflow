/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
      animation: {
        'pulse-highlight': 'pulse 2s ease-in-out infinite',
        'spin': 'spin 1s linear infinite',
        'bounce-dots': 'bounce 1.4s infinite',
      },
    },
  },
  plugins: [],
}
