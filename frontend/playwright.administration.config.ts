import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';
export default defineConfig({ ...identity, testDir: './e2e-administration', outputDir: 'test-results/administration' });
