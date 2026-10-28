import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const LOGIC = [
  'src/lib/opencloud.ts',
  'src/lib/store.tsx',
  'src/lib/groupByDay.ts',
  'src/hooks/useStore.ts',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: LOGIC,
      thresholds: {
        statements: 92,
        branches: 78,
        functions: 92,
        lines: 95,
      },
    },
  },
})
