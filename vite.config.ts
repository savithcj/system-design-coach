import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative base so dist/ works from any static host path.
  base: './',
  test: {
    include: ['tests/core/**/*.test.ts', 'tests/engine/**/*.test.ts', 'tests/fixtures/**/*.test.ts'],
  },
})
