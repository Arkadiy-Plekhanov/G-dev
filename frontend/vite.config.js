import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Qualities — a daily practice of character',
        short_name: 'Qualities',
        description: 'Log what you did. See which qualities showed up. Watch them grow.',
        theme_color: '#EFEEE4',
        background_color: '#EFEEE4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    host: true, // 0.0.0.0 -- works both run directly on host and inside Docker (Tier 1 local dev)
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    testTimeout: 15000,
  },
})
