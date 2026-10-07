import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e-identity',timeout:45_000,expect:{timeout:10_000},workers:1,fullyParallel:false,retries:0,
  reporter:[['list']],outputDir:'test-results/identity',
  use:{baseURL:'http://127.0.0.1:4175',browserName:'chromium',trace:'off',screenshot:'off'},
  // Secrets/action URLs never appear in automatic failure traces or screenshots.
  webServer:[
    ...(process.env.IDENTITY_QA_EXTERNAL_API ? [] : [{command:'npx tsx tests/identityBrowserServer.ts',cwd:'../backend',url:'http://127.0.0.1:5011/__test/health',reuseExistingServer:false,timeout:60_000}]),
    ...(process.env.IDENTITY_QA_EXTERNAL_WEB ? [] : [{command:'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',url:'http://127.0.0.1:4175',reuseExistingServer:false,timeout:60_000,env:{VITE_API_URL:'http://127.0.0.1:5011/api',VITE_SOCKET_URL:'http://127.0.0.1:5011'}}]),
  ],
});
