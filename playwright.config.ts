import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/tmp/**',
  timeout: 60_000,
  workers: 1,
  // Shared CI runners are slower and noisier; retry there and keep a trace of the first retry.
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'on-first-retry' },
});
