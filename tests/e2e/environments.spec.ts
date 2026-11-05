import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openApp, sendAndWait, setUrl, tempDataDir } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/testServer';

let server: TestServer;
test.beforeAll(async () => {
  server = await startTestServer();
});
test.afterAll(async () => {
  await server?.close();
});

async function addVariable(page: import('@playwright/test').Page, key: string, value: string) {
  const dialog = page.getByTestId('environments-dialog');
  await dialog.getByLabel('New key').fill(key);
  await dialog.getByLabel('Value', { exact: true }).last().fill(value);
}

test('environments drive variables, and unresolved ones block the send', async () => {
  const dir = tempDataDir();
  const { app, page } = await openApp(dir);

  await setUrl(page, '{{base}}/echo?env={{who}}');
  await sendAndWait(page);
  await expect(page.getByTestId('error-title')).toHaveText('Unresolved variables');
  await expect(page.getByTestId('response-error')).toContainText('{{base}}');
  await expect(page.getByTestId('response-error')).toContainText('{{who}}');
  await expect(page.locator('[data-testid="url-input"] .cm-var-bad')).toHaveCount(2);

  // Create Dev and Prod environments.
  await page.getByTestId('env-switcher').selectOption('__manage__');
  const dialog = page.getByTestId('environments-dialog');
  await dialog.getByTestId('new-environment').click();
  await page.getByTestId('inline-rename').fill('Dev');
  await page.keyboard.press('Enter');
  await addVariable(page, 'base', server.url);
  await addVariable(page, 'who', 'dev');
  await dialog.getByTestId('env-activate').click();

  await dialog.getByTestId('new-environment').click();
  await page.getByTestId('inline-rename').fill('Prod');
  await page.keyboard.press('Enter');
  await addVariable(page, 'base', server.altUrl);
  await addVariable(page, 'who', 'prod');
  await dialog.getByTestId('env-done').click();

  await expect(page.locator('[data-testid="url-input"] .cm-var-ok')).toHaveCount(2);
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('/echo?env=dev');
  await expect(page.getByTestId('response-body')).toContainText('127.0.0.1');

  const envId = await page
    .getByTestId('env-switcher')
    .evaluate((el: HTMLSelectElement) => [...el.options].find((o) => o.text === 'Prod')!.value);
  await page.getByTestId('env-switcher').selectOption(envId);
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('/echo?env=prod');
  await expect(page.getByTestId('response-body')).toContainText('localhost');

  // With no active environment, the variables are unresolved again.
  await page.getByTestId('env-switcher').selectOption('');
  await sendAndWait(page);
  await expect(page.getByTestId('error-title')).toHaveText('Unresolved variables');

  await page.waitForTimeout(500);
  await app.close();
  expect(existsSync(join(dir, 'data', 'environments'))).toBe(true);
});

test('auth is sent but never written to history', async () => {
  const dir = tempDataDir();
  const { app, page } = await openApp(dir);
  await setUrl(page, `${server.url}/echo`);

  await page
    .getByRole('tab', { name: /^Headers/ })
    .first()
    .click();
  await page.getByLabel('New key').fill('X-Api-Key');
  await page.getByLabel('Value').first().fill('APIKEYSECRET');

  await page.getByRole('tab', { name: /^Auth/ }).click();
  await page.getByLabel('Auth type').selectOption('bearer');
  await page.getByLabel('Bearer token').fill('BEARERSECRET');
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('Bearer BEARERSECRET');

  await page.getByLabel('Auth type').selectOption('basic');
  await page.getByLabel('Username').fill('USERSECRET');
  await page.getByLabel('Password').fill('PASSSECRET');
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('Basic ');

  await page.waitForTimeout(300);
  const history = readFileSync(join(dir, 'data', 'history.json'), 'utf8');
  expect(history).not.toMatch(/BEARERSECRET|APIKEYSECRET|USERSECRET|PASSSECRET/);
  expect(history).toContain('X-Api-Key');

  // Reopening from history needs auth to be entered again.
  await page.getByTestId('sidebar-history').click();
  await expect(page.getByTestId('history-item')).toHaveCount(2);
  await page.getByTestId('history-item').first().click();
  await page.getByRole('tab', { name: /^Auth/ }).click();
  await expect(page.getByLabel('Username')).toHaveValue('');

  await page.getByTestId('clear-history').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await page.waitForTimeout(200);
  expect(JSON.parse(readFileSync(join(dir, 'data', 'history.json'), 'utf8')).entries).toEqual([]);
  await app.close();
});
