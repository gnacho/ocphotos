import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.d.ts'],
      // Suelo global: por debajo de la cobertura actual (95,7 / 89 / 89,7 / 96,7) para no
      // bloquear cambios pequeños, pero suficiente para notar que algo deja de
      // ejecutarse. Los módulos con más valor tienen su propio umbral.
      thresholds: {
        statements: 95,
        branches: 88,
        functions: 88,
        lines: 96,
        'src/composables/**': {
          statements: 95,
          functions: 90,
          lines: 95
        },
        'src/components/**': {
          statements: 85,
          lines: 90
        }
      }
    }
  }
})
