import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// GitHub Pages 部署在子路径下，需配置 base
// 仓库名为 "-"，访问地址为 https://bearduke.github.io/-/
const repoBase = '/-/'

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
