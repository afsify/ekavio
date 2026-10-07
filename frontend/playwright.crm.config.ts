import { defineConfig } from '@playwright/test';
import base from './playwright.identity.config';
export default defineConfig({...base,testDir:'./e2e-crm',outputDir:'test-results/crm',timeout:60_000});
