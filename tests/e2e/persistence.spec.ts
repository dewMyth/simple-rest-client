import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { menuAction, openApp, setUrl, tempDataDir } from './helpers';

test('tabs, drafts and collections survive a restart', async () => {
  const dir = tempDataDir();
  let { app, page } = await openApp(dir);

  // Save the first request into a new collection.
  await setUrl(page, 'http://127.0.0.1:1/users');
  await expect(page.getByTestId('tab').first()).toHaveAttribute('data-dirty', 'true');
  await menuAction(app, 'save');
  await page.getByLabel('Request name').fill('List users');
  await page.getByLabel('New collection name').fill('Users API');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('collection-name')).toHaveText('Users API');
  await expect(page.getByTestId('saved-request')).toHaveAttribute('data-name', 'List users');
  await expect(page.getByTestId('tab').first()).toHaveAttribute('data-dirty', 'false');

  // Edit it without saving (a draft), and open a second, unsaved tab.
  await setUrl(page, 'http://127.0.0.1:1/users?draft=1');
  await page.getByTestId('new-tab').click();
  await setUrl(page, 'http://127.0.0.1:1/unsaved');
  await page.waitForTimeout(800); // session save is debounced by ~500 ms
  await app.close();

  expect(readdirSync(join(dir, 'data', 'collections'))).toHaveLength(1);

  ({ app, page } = await openApp(dir));
  const tabs = page.getByTestId('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'true');
  await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'true');
  await expect(page.locator('[data-testid="url-input"] .cm-content')).toHaveText(
    'http://127.0.0.1:1/unsaved',
  );
  await tabs.nth(0).click();
  await expect(page.locator('[data-testid="url-input"] .cm-content')).toHaveText(
    'http://127.0.0.1:1/users?draft=1',
  );
  await expect(page.getByTestId('collection-name')).toHaveText('Users API');

  // Saving the draft updates the collection in place.
  await menuAction(app, 'save');
  await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'false');
  await page.waitForTimeout(200);
  const file = readdirSync(join(dir, 'data', 'collections'))[0]!;
  expect(readFileSync(join(dir, 'data', 'collections', file), 'utf8')).toContain('draft=1');

  // Closing a dirty tab asks first; Cancel keeps it.
  await tabs.nth(1).click();
  await menuAction(app, 'closeTab');
  await expect(page.getByTestId('close-dialog')).toBeVisible();
  await page.getByTestId('close-cancel').click();
  await expect(tabs).toHaveCount(2);
  await menuAction(app, 'closeTab');
  await page.getByTestId('close-discard').click();
  await expect(tabs).toHaveCount(1);
  await app.close();
});

test('collection actions: create, rename, duplicate, delete', async () => {
  const { app, page } = await openApp(tempDataDir());
  await page.getByTestId('new-collection').click();
  await page.getByTestId('inline-rename').fill('Billing');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('collection-name')).toHaveText('Billing');

  await page.getByTestId('collection').hover();
  await page.getByTestId('collection-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('collection-name')).toHaveText(['Billing', 'Billing copy']);

  await page.getByTestId('collection').nth(1).hover();
  await page.getByTestId('collection-menu').nth(1).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('collection-name')).toHaveText(['Billing']);

  await page.getByTestId('collection').hover();
  await page.getByTestId('collection-menu').click();
  await page.getByRole('menuitem', { name: 'Add request' }).click();
  await page.getByTestId('inline-rename').fill('Create invoice');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('saved-request')).toHaveAttribute('data-name', 'Create invoice');
  await expect(page.getByTestId('tab').last()).toContainText('Create invoice');
  await app.close();
});

test('a corrupt file is preserved with a warning instead of crashing', async () => {
  const dir = tempDataDir();
  mkdirSync(join(dir, 'data', 'collections'), { recursive: true });
  writeFileSync(join(dir, 'data', 'collections', 'broken.json'), '{ this is not json');
  writeFileSync(join(dir, 'data', 'session.json'), 'garbage');

  const { app, page } = await openApp(dir);
  await expect(page.getByTestId('warnings')).toContainText('broken.json');
  await expect(page.getByTestId('warnings').getByRole('status')).toHaveCount(2);
  await expect(page.getByTestId('collections-empty')).toBeVisible();

  const kept = readdirSync(join(dir, 'data', 'collections')).find((f) =>
    f.startsWith('broken.corrupt-'),
  );
  expect(kept).toBeDefined();
  expect(readFileSync(join(dir, 'data', 'collections', kept!), 'utf8')).toBe('{ this is not json');
  expect(existsSync(join(dir, 'data', 'collections', 'broken.json'))).toBe(false);
  await app.close();
});

test('deleting the data folder resets the app', async () => {
  const { app, page } = await openApp(join(tempDataDir(), 'does', 'not', 'exist'));
  await expect(page.getByTestId('collections-empty')).toBeVisible();
  await expect(page.getByTestId('warnings')).toHaveCount(0);
  await app.close();
});
