import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config with proxy to fix CoinGecko CORS issue
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/coingecko': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coingecko/, ''),
      },
    },
  },
})