import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    // Version « artifact » (page unique) : polices intégrées en data: URI.
    assetsInlineLimit: mode === 'artifact' ? 200_000 : 4096,
  },
  server: {
    // `npm run dev:api` : l'API locale (server/) est servie sous /api.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
