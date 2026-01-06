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
    port: 3000,
    open: true,
    proxy: {
      '/asr': 'http://localhost:8082',
      '/chat': 'http://localhost:8082',
      '/materials': 'http://localhost:8082',
      '/admin': 'http://localhost:8082',
      '/health': 'http://localhost:8082',
      '/server-status': 'http://localhost:8082'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
