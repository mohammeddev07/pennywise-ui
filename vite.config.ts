/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

// The CSP's connect-src must name the API origin. Fill it in from VITE_API_BASE_URL at build time so the
// backend address lives only in the host's env vars, never in the repo. Fallback matches src/shared/api/config.ts.
const cspApiOrigin = (mode: string): Plugin => ({
  name: 'csp-api-origin',
  apply: 'build',
  writeBundle({ dir = 'dist' }) {
    const base = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL || 'http://localhost:8080/api'
    const file = `${dir}/_headers`
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__API_ORIGIN__', new URL(base).origin))
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    cspApiOrigin(mode),
    VitePWA({
      // The app asks before activating a new version (UpdatePrompt), like mobile's OTA update toast.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'PennyWise',
        short_name: 'PennyWise',
        description: 'Not-so-boring cash management: books, budgets and insights.',
        theme_color: '#0B0D0F',
        background_color: '#0B0D0F',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only. API data is cached by TanStack Query persistence, never by the service worker,
        // so a stale SW cache can never show another account's data.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // ponytail: the mock backend chunk is still emitted but unreferenced when VITE_MOCK_API is off; don't
        // precache it. Alias it to a stub in production if its 8 kB on the CDN ever matters.
        globIgnores: ['**/mockAdapter-*.js'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  define: { __DEV__: JSON.stringify(mode !== 'production') },
  resolve: {
    alias: {
      '@': src(''),
      // Domain code is copied from pennywise-mobile unchanged; these two native
      // storage modules resolve to a localStorage adapter on the web.
      '@react-native-async-storage/async-storage': src('platform/asyncStorage.ts'),
      'expo-secure-store': src('platform/secureStore.ts'),
    },
  },
  // Logic tests ported from pennywise-mobile run against its in-memory mock backend, like they do there.
  test: {
    environment: 'node',
    globals: true,
    globalSetup: './vitest.global-setup.ts',
    env: { VITE_MOCK_API: 'true' },
  },
}))
