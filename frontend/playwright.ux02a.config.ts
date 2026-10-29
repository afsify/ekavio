import { defineConfig } from '@playwright/test';
import foundation from './playwright.config';

// Same deadlines and zero retries as foundation; one resource-bounded worker.
// The optional before snapshot is an ignored git archive of accepted UX-01.
export default defineConfig({
  ...foundation,
  testMatch: /ux02a-business-screens\.spec\.ts/,
  workers: 1,
  outputDir: `test-results/ux02a-run-${process.env.UX02A_SCREENSHOT_PHASE ?? 'after'}`,
  webServer: {
    command: process.env.UX02A_SCREENSHOT_PHASE === 'before'
      ? 'node node_modules/vite/bin/vite.js preview ../.cache/ux02a-before/frontend --host 127.0.0.1 --port 4173 --strictPort'
      : 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000,
    env: { VITE_API_URL: 'http://127.0.0.1:5009/api', VITE_SOCKET_URL: 'http://127.0.0.1:5009' },
  },
});
