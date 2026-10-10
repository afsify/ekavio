import { defineConfig } from '@playwright/test';
import base from './playwright.identity.config';
export default defineConfig({ ...base, testDir: './e2e-relationships', outputDir: 'test-results/relationships', timeout: 60_000 });
