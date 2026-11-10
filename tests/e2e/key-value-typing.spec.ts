import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { openApp, setUrl, tempDataDir } from './helpers';

// Regression: typing into a table's empty "new" row used to create a new row per keystroke,
// because focus stayed on the empty row. These tests type one key at a time, like a person.

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await openApp(tempDataDir()));
  await setUrl(page, 'https://api.test/items');
});
test.afterAll(async () => {
  await app?.close();
});

async function typeRow(table: Locator, key: string, value: string) {
  await table.getByLabel('New key', { exact: true }).click();
  await page.keyboard.type(key);
  await page.keyboard.press('Tab');
  await page.keyboard.type(value);
}

async function expectRows(table: Locator, rows: [string, string][]) {
  await expect(table.getByLabel('Key', { exact: true })).toHaveCount(rows.length);
  for (const [i, [k, v]] of rows.entries()) {
    await expect(table.getByLabel('Key', { exact: true }).nth(i)).toHaveValue(k);
    await expect(table.getByLabel('Value', { exact: true }).nth(i)).toHaveValue(v);
  }
}

test('form URL-encoded fields', async () => {
  await page.getByRole('tab', { name: /^Body/ }).click();
  await page.getByRole('radio', { name: 'Form URL-encoded' }).click();
  const table = page.getByRole('table', { name: 'Form fields' });
  await typeRow(table, 'user', 'ada lovelace');
  await typeRow(table, 'role', 'admin');
  await expectRows(table, [
    ['user', 'ada lovelace'],
    ['role', 'admin'],
  ]);
});

test('starting in the value column', async () => {
  const table = page.getByRole('table', { name: 'Form fields' });
  await table.getByLabel('New value', { exact: true }).click();
  await page.keyboard.type('only-value');
  await expect(table.getByLabel('Value', { exact: true }).last()).toHaveValue('only-value');
  await expect(table.getByLabel('Value', { exact: true }).last()).toBeFocused();
  await expect(table.getByLabel('Key', { exact: true })).toHaveCount(3);
});

test('headers', async () => {
  await page
    .getByRole('tab', { name: /^Headers/ })
    .first()
    .click();
  const table = page.getByRole('table', { name: 'Headers' });
  await typeRow(table, 'X-Request-Id', 'abc-123');
  await expectRows(table, [['X-Request-Id', 'abc-123']]);
});

test('query params, which also update the URL', async () => {
  await page
    .getByRole('tab', { name: /^Params/ })
    .first()
    .click();
  const table = page.getByRole('table', { name: 'Query parameters' });
  await typeRow(table, 'page', '2');
  await expectRows(table, [['page', '2']]);
  await expect(page.locator('[data-testid="url-input"] .cm-content')).toHaveText(
    'https://api.test/items?page=2',
  );
});

test('multipart fields', async () => {
  await page.getByRole('tab', { name: /^Body/ }).click();
  await page.getByRole('radio', { name: 'Multipart' }).click();
  const table = page.getByRole('table', { name: 'Multipart fields' });
  // Converting from the form body keeps its fields; add a new one by typing.
  const before = await table.getByLabel('Key', { exact: true }).count();
  await table.getByLabel('New key', { exact: true }).click();
  await page.keyboard.type('caption');
  await expect(table.getByLabel('Key', { exact: true })).toHaveCount(before + 1);
  await expect(table.getByLabel('Key', { exact: true }).last()).toHaveValue('caption');
});

test('environment variables', async () => {
  await page.getByTestId('env-switcher').selectOption('__manage__');
  const dialog = page.getByTestId('environments-dialog');
  await dialog.getByTestId('new-environment').click();
  await page.keyboard.type('Dev');
  await page.keyboard.press('Enter');
  const table = dialog.getByRole('table', { name: 'Variables' });
  await typeRow(table, 'baseUrl', 'http://localhost:3000');
  await expectRows(table, [['baseUrl', 'http://localhost:3000']]);
  await dialog.getByTestId('env-done').click();
});
