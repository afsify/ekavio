import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, workers: 1, testDir: './e2e-entity-forms-visual', outputDir: 'test-results/entity-forms-visual-batch3', timeout: 120_000, use: { ...base.use, trace: 'off', screenshot: 'off' } });
