import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined && process.env.CI !== '',
  retries: process.env.CI !== undefined && process.env.CI !== '' ? 2 : 0,
  workers: process.env.CI !== undefined && process.env.CI !== '' ? 1 : undefined,
  reporter: [['./src/reporter.ts', { serverUrl: 'ws://localhost:3000' }], ['html']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'bun src/server.ts',
      url: 'http://localhost:3000',
      reuseExistingServer: !(process.env.CI !== undefined && process.env.CI !== ''),
    },
    {
      command: 'bunx serve . --listen 3001 --no-clipboard',
      url: 'http://localhost:3001',
      reuseExistingServer: !(process.env.CI !== undefined && process.env.CI !== ''),
    },
  ],
})
