import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', headless: true, viewport: { width: 1440, height: 1400 } },
  webServer: [
    { command: 'node e2e/seed.cjs && npx json-server e2e/db.test.json --host 127.0.0.1 --port 3101', url: 'http://127.0.0.1:3101/trips', reuseExistingServer: false, timeout: 30000 },
    { command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', env: { API_TARGET: 'http://127.0.0.1:3101' }, reuseExistingServer: false, timeout: 30000 }
  ]
});
