import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

test('renderer has no Node or Electron access', async () => {
  const app = await launchApp();
  try {
    const win = await app.firstWindow();
    await win.waitForSelector('[data-testid="app-root"]');
    const globals = await win.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        require: typeof w['require'],
        process: typeof w['process'],
        module: typeof w['module'],
        api: typeof w['api'],
      };
    });
    expect(globals).toEqual({
      require: 'undefined',
      process: 'undefined',
      module: 'undefined',
      api: 'object',
    });

    const opened = await win.evaluate(() => window.open('https://example.com'));
    expect(opened).toBeNull();
  } finally {
    await app.close();
  }
});
