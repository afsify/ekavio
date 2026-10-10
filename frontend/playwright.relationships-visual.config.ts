import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, testDir: './e2e-relationships-visual', outputDir: 'test-results/relationships-visual', timeout: 90_000, use: { ...base.use, screenshot: 'off', trace: 'off' } });
