import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';
export default defineConfig({...identity,testDir:'./e2e-fields',outputDir:'test-results/dynamic-fields',timeout:60_000});
