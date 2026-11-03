import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-tasks', timeout: 45_000, expect: { timeout: 10_000 },
  workers: 1, fullyParallel: false, retries: 0, reporter: [['list']], outputDir: 'test-results/tasks',
  use: { baseURL: 'http://127.0.0.1:4177', browserName: 'chromium', trace: 'off', screenshot: 'off' },
  webServer: [
    ...(process.env.TASKS_QA_EXTERNAL_API ? [] : [{ command: 'npx tsx tests/tasksBrowserServer.ts', cwd: '../backend', url: 'http://127.0.0.1:5013/__test/health', reuseExistingServer: false, timeout: 60_000 }]),
    ...(process.env.TASKS_QA_EXTERNAL_WEB ? [] : [{ command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4177 --strictPort', url: 'http://127.0.0.1:4177', reuseExistingServer: false, timeout: 60_000, env: { VITE_API_URL: 'http://127.0.0.1:5013/api', VITE_SOCKET_URL: 'http://127.0.0.1:5013' } }]),
  ],
});
