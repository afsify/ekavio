import { defineConfig } from '@playwright/test';
import base from './playwright.identity.config';
export default defineConfig({...base,testDir:'./e2e-analytics',outputDir:'test-results/analytics',timeout:60_000});
