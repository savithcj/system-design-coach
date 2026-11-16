import { defineConfig } from '@playwright/test'

// Real Google Chrome (not bundled Chromium): jsdom and headless shells have missed hover/focus/layout bugs.
export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', viewport: { width: 1200, height: 760 } },
})
