/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
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
