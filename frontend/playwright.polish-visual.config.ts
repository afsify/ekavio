import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, workers: 1, testDir: './e2e-polish-visual', outputDir: 'test-results/polish-visual-batch4', timeout: 120_000, use: { ...base.use, trace: 'off', screenshot: 'off' } });
