/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1a365d',
          dark: '#0f1b2d',
          light: '#2a4a7f',
        },
        gold: {
          DEFAULT: '#d4a843',
          light: '#f0d68a',
          dim: '#a07c2e',
        },
        cream: '#faf8f2',
      },
      fontFamily: {
        sans: ['Noto Sans SC', 'PingFang SC', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['Noto Serif SC', 'serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
