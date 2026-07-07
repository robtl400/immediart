import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new deploy activates immediately — no stuck stale shell.
      registerType: 'autoUpdate',
      // Inject the SW registration into the built HTML (build-time only, so the
      // vitest/jsdom suite never registers a worker — nothing to guard in JS).
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png'],
      workbox: {
        // Precache the app shell + self-hosted fonts. Only woff2 is precached
        // (every current browser supports it); the woff fallback stays on disk
        // but out of the offline cache to keep it lean. Met images/data are NOT
        // runtime-cached — IndexedDB already covers data, and image quota
        // policy is out of scope for this epic.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        id: '/',
        name: 'ImmediArt',
        short_name: 'ImmediArt',
        description: 'Discover art from The Metropolitan Museum of Art',
        start_url: '/',
        display: 'standalone',
        background_color: '#121212',
        theme_color: '#121212',
        // Split maskable/any into separate entries (a combined "maskable any"
        // purpose makes the maskable safe-zone padding shrink the "any" render).
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
