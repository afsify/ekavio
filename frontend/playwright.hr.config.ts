import { defineConfig } from '@playwright/test';
import base from './playwright.identity.config';
export default defineConfig({...base,testDir:'./e2e-hr',outputDir:'test-results/hr',timeout:90_000});
