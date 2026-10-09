import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';
export default defineConfig({ ...identity, testDir: './e2e-operations', timeout: 90_000, outputDir: 'test-results/operations', use: { ...identity.use, trace: 'off', screenshot: 'off' } });
