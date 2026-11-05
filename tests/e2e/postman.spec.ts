import { test, expect, type ElectronApplication } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openApp, sendAndWait, tempDataDir } from './helpers';
import { startTestServer } from '../fixtures/testServer';

const FIXTURES = join(__dirname, '../fixtures/postman');

function stubSaveDialog(app: ElectronApplication, path: string) {
  return app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: p,
    })) as typeof dialog.showSaveDialog;
  }, path);
}

function stubOpenDialog(app: ElectronApplication, paths: string[]) {
  return app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: p,
    })) as typeof dialog.showOpenDialog;
  }, paths);
}

test('import Postman collections and environments, and export for Postman', async () => {
  const server = await startTestServer();
  const files = tempDataDir();
  // A Postman environment pointing at the local test server.
  const envFile = join(files, 'local.postman_environment.json');
  const env = JSON.parse(readFileSync(join(FIXTURES, 'dev.postman_environment.json'), 'utf8'));
  env.name = 'Local';
  env.values[0].value = server.url;
  writeFileSync(envFile, JSON.stringify(env));

  const { app, page } = await openApp(tempDataDir());
  try {
    await stubOpenDialog(app, [join(FIXTURES, 'sample.postman_collection.json'), envFile]);
    await page.getByTestId('import-collection').click();

    await expect(page.getByTestId('collection-name')).toHaveText(['Shop API']);
    await expect(page.getByTestId('notice')).toHaveText('Imported “Shop API” and 2 environments');
    const warning = page.getByTestId('warnings').getByRole('alert');
    await expect(warning).toContainText(
      'sample.postman_collection.json was imported with some changes',
    );
    await expect(warning).toContainText('scripts were skipped');
    await expect(page.getByTestId('saved-request')).toHaveCount(10);
    await expect(page.getByTestId('saved-request').nth(1)).toHaveAttribute(
      'data-name',
      'Products / List products',
    );

    // Both environments are available; use the Postman environment to hit the test server.
    const options = await page.getByTestId('env-switcher').locator('option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Shop API variables', 'Local']));
    const localId = await page
      .getByTestId('env-switcher')
      .evaluate((el: HTMLSelectElement) => [...el.options].find((o) => o.text === 'Local')!.value);
    await page.getByTestId('env-switcher').selectOption(localId);

    await page.getByTestId('saved-request').nth(1).click();
    await expect(page.locator('[data-testid="url-input"] .cm-content')).toHaveText(
      '{{base}}/products?page=1&q=shoes',
    );
    await sendAndWait(page);
    // The test server echoes 404 for unknown paths, with the path it saw.
    await expect(page.getByTestId('response-body')).toContainText('/products');
    await page
      .getByRole('tab', { name: /^Headers/ })
      .first()
      .click();
    await page
      .getByRole('tab', { name: /^Params/ })
      .first()
      .click();
    await expect(page.getByRole('tab', { name: 'Params (2)' })).toBeVisible();

    // Export as Postman v2.1 and check the file.
    const out = join(files, 'shop.postman_collection.json');
    await page.getByTestId('collection-name').hover();
    await page.getByTestId('collection-menu').click();
    await page.getByRole('menuitem', { name: 'Export…' }).click();
    await page.getByTestId('export-format-postman').check();
    await stubSaveDialog(app, out);
    await page.getByTestId('export-confirm').click();
    await expect(page.getByTestId('notice')).toHaveText('Exported “Shop API” for Postman');

    const exported = JSON.parse(readFileSync(out, 'utf8'));
    expect(exported.info.schema).toBe(
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    );
    expect(exported.item).toHaveLength(10);
    expect(exported.item[1]).toMatchObject({
      name: 'Products / List products',
      request: { method: 'GET', url: { raw: '{{base}}/products?page=1&q=shoes' } },
    });
    // Secrets were not included (the default).
    expect(JSON.stringify(exported)).not.toContain('s3cret');

    // And the exported file imports again.
    await stubOpenDialog(app, [out]);
    await page.mouse.move(600, 400);
    await page.getByTestId('import-collection').click();
    await expect(page.getByTestId('collection-name')).toHaveText(['Shop API', 'Shop API (2)']);
  } finally {
    await app.close();
    await server.close();
  }
});
