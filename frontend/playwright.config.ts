import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 30_000, expect: { timeout: 10_000 }, fullyParallel: true, retries: 0,
  workers: process.env.CI ? 2 : 2,
  reporter: [['list']], outputDir: 'test-results/foundation',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000, env: { VITE_API_URL: 'http://127.0.0.1:5009/api', VITE_SOCKET_URL: 'http://127.0.0.1:5009' } },
});
