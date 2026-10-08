import { defineConfig } from '@playwright/test';
import base from './playwright.identity.config';
export default defineConfig({...base,testDir:'./e2e-purchasing',outputDir:'test-results/purchasing',timeout:60_000});
