import { test, expect, type ElectronApplication } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { menuAction, openApp, setUrl, tempDataDir } from './helpers';

/** Makes the next native save dialog return `path`. */
function stubSaveDialog(app: ElectronApplication, path: string) {
  return app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: p,
    })) as typeof dialog.showSaveDialog;
  }, path);
}

/** Makes the next native open dialog return `paths`. */
function stubOpenDialog(app: ElectronApplication, paths: string[]) {
  return app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: p,
    })) as typeof dialog.showOpenDialog;
  }, paths);
}

test('export a collection to JSON and import it on another machine', async () => {
  const files = tempDataDir();
  const plain = join(files, 'users.simplerest.json');
  const withSecrets = join(files, 'users-secrets.simplerest.json');

  // Machine A: build a collection with a secret and export it twice.
  let { app, page } = await openApp(tempDataDir());
  await setUrl(page, 'https://api.test/users?page=1');
  await page.getByRole('tab', { name: /^Auth/ }).click();
  await page.getByLabel('Auth type').selectOption('bearer');
  await page.getByLabel('Bearer token').fill('TOPSECRET');
  await menuAction(app, 'save');
  await page.getByLabel('Request name').fill('List users');
  await page.getByLabel('New collection name').fill('Users API');
  await page.getByTestId('save-confirm').click();

  const openExport = async () => {
    // Chromium only re-evaluates :hover on pointer movement, so leave and come back.
    await page.mouse.move(600, 400);
    await page.getByTestId('collection-name').hover();
    await page.getByTestId('collection-menu').click();
    await page.getByRole('menuitem', { name: 'Export…' }).click();
    await expect(page.getByTestId('export-dialog')).toBeVisible();
  };

  await openExport();
  await expect(page.getByTestId('export-include-secrets')).not.toBeChecked();
  await stubSaveDialog(app, plain);
  await page.getByTestId('export-confirm').click();
  await expect(page.getByTestId('notice')).toHaveText('Exported “Users API”');

  await openExport();
  await page.getByTestId('export-include-secrets').check();
  await expect(page.getByTestId('export-secrets-warning')).toBeVisible();
  await stubSaveDialog(app, withSecrets);
  await page.getByTestId('export-confirm').click();
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);
  await app.close();

  const plainText = readFileSync(plain, 'utf8');
  expect(plainText).not.toContain('TOPSECRET');
  expect(JSON.parse(plainText)).toMatchObject({
    format: 'simplerest-collection',
    formatVersion: 1,
    includesSecrets: false,
    collections: [
      {
        name: 'Users API',
        requests: [{ name: 'List users', url: 'https://api.test/users?page=1' }],
      },
    ],
  });
  expect(readFileSync(withSecrets, 'utf8')).toContain('TOPSECRET');

  // Machine B: import both files plus a broken one.
  const broken = join(files, 'broken.json');
  writeFileSync(broken, '{ nope');
  ({ app, page } = await openApp(tempDataDir()));
  await stubOpenDialog(app, [plain, withSecrets, broken]);
  await page.getByTestId('import-collection').click();
  await expect(page.getByTestId('collection-name')).toHaveText(['Users API', 'Users API (2)']);
  await expect(page.getByTestId('notice')).toContainText('Imported 2 collections');
  await expect(page.getByTestId('warnings').getByRole('alert')).toContainText(
    "broken.json: The file isn't valid JSON.",
  );

  // The imported request opens and keeps its URL; only the file with secrets has the token.
  await page.getByTestId('saved-request').first().click();
  await expect(page.locator('[data-testid="url-input"] .cm-content')).toHaveText(
    'https://api.test/users?page=1',
  );
  await page.getByRole('tab', { name: /^Auth/ }).click();
  await expect(page.getByLabel('Bearer token')).toHaveValue('');
  await page.getByTestId('saved-request').nth(1).click();
  await page.getByRole('tab', { name: /^Auth/ }).click();
  await expect(page.getByLabel('Bearer token')).toHaveValue('TOPSECRET');

  // The File menu item imports too.
  await stubOpenDialog(app, [plain]);
  await menuAction(app, 'importCollection');
  await expect(page.getByTestId('collection-name')).toHaveText([
    'Users API',
    'Users API (2)',
    'Users API (3)',
  ]);
  await app.close();
});
