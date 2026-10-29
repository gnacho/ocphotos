import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Código propio de la app. Queda fuera src/components/ui/** (shadcn vendorizado),
// src/lib/demoData.ts (datos de ejemplo) y los tipos.
const LOGIC = [
  'src/App.tsx',
  'src/components/*.tsx',
  'src/lib/opencloud.ts',
  'src/lib/store.tsx',
  'src/lib/groupByDay.ts',
  'src/lib/images.ts',
  'src/hooks/useStore.ts',
  'src/hooks/useImageUrl.ts',
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
      exclude: ['src/**/*.spec.{ts,tsx}'],
      thresholds: {
        statements: 97,
        branches: 90,
        functions: 97,
        lines: 99,
      },
    },
  },
})
