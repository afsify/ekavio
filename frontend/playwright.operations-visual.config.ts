import { defineConfig } from '@playwright/test';
import foundation from './playwright.config';
export default defineConfig({ ...foundation, testDir: './e2e-operations-visual', timeout: 60_000, outputDir: 'test-results/operations-visual', use: { ...foundation.use, trace: 'off', screenshot: 'off' } });
