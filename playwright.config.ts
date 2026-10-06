import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseURL);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.PLAYWRIGHT_DISABLE_VIDEO === '1' ? 'off' : 'retain-on-failure',
  },
  webServer: local ? { command: 'npm run dev', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 } : undefined,
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: executablePath ? { executablePath } : undefined,
    },
  }],
});
