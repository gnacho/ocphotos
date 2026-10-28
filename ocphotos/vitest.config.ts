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
      // Suelo global: por debajo de la cobertura actual (94,6 / 89 / 86,2 / 95,5) para no
      // bloquear cambios pequeños, pero suficiente para notar que algo deja de
      // ejecutarse. Los módulos con más valor tienen su propio umbral.
      thresholds: {
        statements: 93,
        branches: 85,
        functions: 82,
        lines: 93,
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
