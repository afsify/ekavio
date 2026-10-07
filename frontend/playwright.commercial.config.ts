import { defineConfig } from '@playwright/test';
import base from './playwright.identity.config';
export default defineConfig({ ...base, testDir: './e2e-commercial', outputDir: 'test-results/commercial', timeout: 60_000 });
