import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, workers: 1, testDir: './e2e-administration-visual', outputDir: 'test-results/administration-visual', timeout: 120_000, use: { ...base.use, trace: 'off', screenshot: 'off' } });
