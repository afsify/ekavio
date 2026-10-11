import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, workers: 1, testDir: './e2e-fields-visual', outputDir: 'test-results/fields-visual-batch1', timeout: 60_000, use: { ...base.use, trace: 'off', screenshot: 'off' } });
