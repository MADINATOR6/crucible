// Browser smoke tests. `node --test` covers the logic against stub elements; these drive the real app in a real
// browser, so they catch what stubs cannot: IndexedDB, event wiring, layout and the service worker.
// Its own port, so it never collides with a dev server you are using on 5173.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Each test gets its own browser context and storage anyway; one worker because a handful of short tests against
  // one dev server gain nothing from parallelism, and serial output is easier to read.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
    // Safari's engine, where iPhone bugs actually appear. Not a real iPhone: the device checks in README still apply.
    { name: 'ios', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: `node dev-server.mjs ${PORT}`, url: `${baseURL}/`, reuseExistingServer: !process.env.CI, stdout: 'ignore' },
});
