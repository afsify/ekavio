import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';
export default defineConfig({ ...identity, testDir: './e2e-experience', outputDir: 'test-results/experience', timeout: 180_000 });
