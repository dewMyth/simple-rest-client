import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, sendAndWait, setUrl } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/testServer';

let server: TestServer;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  server = await startTestServer();
  app = await launchApp();
  page = await app.firstWindow();
  await page.waitForSelector('[data-testid="app-root"]');
});

test.afterAll(async () => {
  await app?.close();
  await server?.close();
});

test('sends a GET and shows status, headers and body', async () => {
  await setUrl(page, `${server.url}/echo?x=1`);
  await expect(page.getByRole('tab', { name: 'Params (1)' })).toBeVisible();
  await sendAndWait(page);
  await expect(page.getByTestId('response-status')).toHaveText('200 OK');
  await expect(page.getByTestId('response-body')).toContainText('"method": "GET"');
  await page
    .getByRole('tab', { name: /^Headers \(\d+\)$/ })
    .last()
    .click();
  await expect(page.getByTestId('response-headers')).toContainText('Content-Type');
  await page.getByRole('tab', { name: 'Body', exact: true }).last().click();
});

test('pretty view keeps big integers exact', async () => {
  await setUrl(page, `${server.url}/bigint`);
  await sendAndWait(page);
  const body = page.getByTestId('response-body');
  await expect(body).toContainText('"id": 12345678901234567890');
  await expect(body).toContainText('-98765432109876543210');
  await page.getByRole('radio', { name: 'Raw' }).click();
  await expect(body).toContainText('{"id":12345678901234567890');
  await page.getByRole('radio', { name: 'Pretty' }).click();
});

test('sends each body type', async () => {
  await setUrl(page, `${server.url}/echo`);
  await page.getByLabel('HTTP method').selectOption('POST');
  await page.getByRole('tab', { name: /^Body/ }).first().click();

  await page.getByRole('radio', { name: 'JSON' }).click();
  await page.locator('[data-testid="body-editor"] .cm-content').click();
  await page.keyboard.insertText('{"hello":"world"}');
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('application/json');
  await expect(page.getByTestId('response-body')).toContainText('{\\"hello\\":\\"world\\"}');

  await page.getByRole('radio', { name: 'Text' }).click();
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('text/plain; charset=utf-8');

  await page.getByRole('radio', { name: 'Form URL-encoded' }).click();
  await page.getByLabel('New key').first().fill('a');
  await page.getByLabel('Value').first().fill('1 2');
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('"body": "a=1+2"');

  await page.getByRole('radio', { name: 'Multipart' }).click();
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('multipart/form-data; boundary=');

  await page.getByRole('radio', { name: 'None' }).click();
});

test('shows errors in the response panel', async () => {
  await page.getByLabel('HTTP method').selectOption('GET');
  await setUrl(page, 'http://does-not-exist.invalid/');
  await sendAndWait(page);
  await expect(page.getByTestId('error-title')).toHaveText('Host not found');
});

test('cancels a slow request', async () => {
  await setUrl(page, `${server.url}/slow?ms=5000`);
  await page.getByTestId('send-button').click();
  await page.getByTestId('cancel-button').click();
  await expect(page.getByTestId('error-title')).toHaveText('Cancelled');
});

test('a 50 MB response leaves the UI responsive', async () => {
  await setUrl(page, `${server.url}/large?mb=50`);
  await sendAndWait(page);
  await expect(page.getByTestId('truncated-notice')).toBeVisible();
  await expect(page.getByTestId('response-meta')).toContainText('50 MB');

  // Typing into the URL bar should stay fast with the big response on screen.
  await page.locator('[data-testid="url-input"] .cm-content').click();
  await page.keyboard.press('End');
  const started = Date.now();
  await page.keyboard.type('&typing=fast', { delay: 0 });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(1500);

  // The main thread should answer within a frame or two.
  const frameDelay = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const t = performance.now();
        requestAnimationFrame(() => resolve(performance.now() - t));
      }),
  );
  expect(frameDelay).toBeLessThan(200);
});

test('tabs: new, switch and dirty indicator', async () => {
  const before = await page.getByTestId('tab').count();
  await page.getByTestId('new-tab').click();
  await expect(page.getByTestId('tab')).toHaveCount(before + 1);
  await expect(page.getByTestId('response-empty')).toBeVisible();
  await setUrl(page, `${server.url}/echo`);
  await expect(page.getByTestId('tab').last()).toHaveAttribute('data-dirty', 'true');
  await page.getByTestId('tab').first().click();
  await expect(page.getByTestId('response-view')).toBeVisible();
});
