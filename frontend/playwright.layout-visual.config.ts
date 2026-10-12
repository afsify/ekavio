import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, workers: 1, testDir: './e2e-layout-visual', outputDir: 'test-results/layout-visual-batch2', timeout: 60_000, use: { ...base.use, trace: 'off', screenshot: 'off' } });
