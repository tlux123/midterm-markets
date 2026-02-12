import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/kalshi': {
        target: 'https://api.elections.kalshi.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/kalshi/, ''),
      },
      '/api/civic': {
        target: 'https://civicapi.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/civic/, ''),
      },
      '/api/fred': {
        target: 'https://api.stlouisfed.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/fred/, ''),
      },
      '/api/news': {
        target: 'https://news.google.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/news/, ''),
      },
      '/kalshi-api': {
        target: 'https://api.elections.kalshi.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/kalshi-api/, ''),
      },
      '/civic-api': {
        target: 'https://civicapi.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/civic-api/, ''),
      },
      '/fred-api': {
        target: 'https://api.stlouisfed.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/fred-api/, ''),
      },
      '/news-rss': {
        target: 'https://news.google.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/news-rss/, ''),
      },
    },
  },
})
