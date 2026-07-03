import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// GitHub Pages 部署在子路径下，需配置 base
// 仓库名"执行小助手"经 URL 编码后为 %E6%89%A7%E8%A1%8C%E5%B0%8F%E5%8A%A9%E6%89%8B
const repoBase = '/%E6%89%A7%E8%A1%8C%E5%B0%8F%E5%8A%A9%E6%89%8B/'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? repoBase : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../packages/core/src'),
    },
  },
  server: {
    host: '127.0.0.1',
  },
})
