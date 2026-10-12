import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3001,
    open: true,
    proxy: {
      '/api/v1': 'http://127.0.0.1:8082',
      '/asr': 'http://127.0.0.1:8082',
      '/chat': 'http://127.0.0.1:8082',
      '/materials': 'http://127.0.0.1:8082',
      '/admin': 'http://127.0.0.1:8082',
      '/health': 'http://127.0.0.1:8082',
      '/server-status': 'http://127.0.0.1:8082',
      '/generate-cover': 'http://127.0.0.1:8082',
      '/export-media': 'http://127.0.0.1:8082',
      '/export-download': 'http://127.0.0.1:8082',
      '/tts': 'http://127.0.0.1:8082'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
