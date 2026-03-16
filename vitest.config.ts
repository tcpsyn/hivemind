import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environmentMatchGlobs: [['src/__tests__/main/**', 'node']],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/main/**', 'src/renderer/src/**', 'src/shared/**', 'src/preload/**'],
      exclude: ['src/__tests__/**', '**/*.d.ts']
    }
  }
})
