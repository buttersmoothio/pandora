import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    pool: 'forks', // Each fork gets its own lockdown()
    coverage: {
      provider: 'istanbul', // v8 needs node:inspector (unavailable in Bun)
      reporter: ['text', 'lcov'], // lcov for IDE integration
      reportsDirectory: './coverage',
    },
  },
})
