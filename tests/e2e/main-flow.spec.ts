import { test, expect } from '@playwright/test';
import { menuAction, openApp, sendAndWait, setUrl, tempDataDir } from './helpers';
import { startTestServer } from '../fixtures/testServer';

test('main flow: open, send, save, restart, reopen', async () => {
  const server = await startTestServer();
  const dir = tempDataDir();
  try {
    // Open and send.
    let { app, page } = await openApp(dir);
    await setUrl(page, `${server.url}/bigint`);
    await sendAndWait(page);
    await expect(page.getByTestId('response-status')).toHaveText('200 OK');

    // Save into a new collection.
    await menuAction(app, 'save');
    await page.getByLabel('Request name').fill('Big numbers');
    await page.getByLabel('New collection name').fill('Main flow');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('tab').first()).toHaveAttribute('data-dirty', 'false');
    await page.waitForTimeout(700);

    // Restart.
    await app.close();
    ({ app, page } = await openApp(dir));

    // The session restores the saved tab. Close it (it's clean, so no prompt), then reopen the
    // request from the sidebar and send it again.
    await expect(page.getByTestId('collection-name')).toHaveText('Main flow');
    await expect(page.getByTestId('tab').first()).toContainText('Big numbers');
    await menuAction(app, 'closeTab');
    await expect(page.getByTestId('tab').first()).toContainText('Untitled');
    await page.getByTestId('saved-request').click();
    await expect(page.getByTestId('tab')).toHaveCount(1);
    await expect(page.locator('[data-testid="url-input"] .cm-content')).toHaveText(
      `${server.url}/bigint`,
    );
    await sendAndWait(page);
    await expect(page.getByTestId('response-body')).toContainText('12345678901234567890');
    await app.close();
  } finally {
    await server.close();
  }
});
