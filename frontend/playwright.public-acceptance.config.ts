import { defineConfig } from '@playwright/test';

// Explicit read-only hosted public opt-in. Never uses accounts or submits forms.
export default defineConfig({
  testDir: './e2e-public-acceptance', timeout: 90_000, retries: 0, workers: 1,
  reporter: [['list']], outputDir: 'test-results/public-acceptance',
  use: { baseURL: 'https://ekavio.afsify.com', browserName: 'chromium',
    trace: 'off', screenshot: 'off', video: 'off' },
});
