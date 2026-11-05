import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { menuAction, openApp, sendAndWait, setUrl, tempDataDir } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/testServer';

let server: TestServer;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  server = await startTestServer();
  ({ app, page } = await openApp(tempDataDir()));
});
test.afterAll(async () => {
  await app?.close();
  await server?.close();
});

const urlText = () => page.locator('[data-testid="url-input"] .cm-content');

async function paste(text: string) {
  await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text);
  await urlText().click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.paste());
}

test('pasting a cURL command imports it', async () => {
  await paste(
    `curl -X PATCH '${server.url}/echo?x=1' \\\n  -H 'X-Name: O'\\''Brien' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"a":"it'\\''s"}' -u me:pw`,
  );
  await expect(page.getByTestId('notice')).toHaveText('Imported cURL command');
  await expect(urlText()).toHaveText(`${server.url}/echo?x=1`);
  await expect(page.getByLabel('HTTP method')).toHaveValue('PATCH');
  await expect(page.getByRole('tab', { name: 'Params (1)' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Headers (1)' })).toBeVisible();

  await sendAndWait(page);
  const body = page.getByTestId('response-body');
  await expect(body).toContainText('"method": "PATCH"');
  await expect(body).toContainText(`"x-name": "O'Brien"`);
  await expect(body).toContainText(`Basic ${Buffer.from('me:pw').toString('base64')}`);
  await expect(body).toContainText(`{\\"a\\":\\"it's\\"}`);
});

test('pasting a normal URL still pastes text', async () => {
  await page.getByTestId('new-tab').click();
  await paste(`${server.url}/plain`);
  await expect(urlText()).toHaveText(`${server.url}/plain`);
});

test('copy as cURL then paste gives the same request', async () => {
  await page.getByTestId('tab').first().click();
  await page.getByTestId('request-actions').click();
  await page.getByRole('menuitem', { name: 'Copy as cURL' }).click();
  await expect(page.getByTestId('notice')).toHaveText('Copied as cURL');
  const command = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(command).toMatch(/^curl -X PATCH /);
  expect(command).toContain(`'X-Name: O'\\''Brien'`);

  await page.getByTestId('new-tab').click();
  await paste(command);
  await sendAndWait(page);
  await expect(page.getByTestId('response-body')).toContainText('"method": "PATCH"');
  await expect(page.getByTestId('response-body')).toContainText(`"x-name": "O'Brien"`);
});

test('every section 9 shortcut has a menu accelerator', async () => {
  const accelerators = await app.evaluate(({ Menu }) => {
    const out: Record<string, string> = {};
    const walk = (items: Electron.MenuItem[]) => {
      for (const i of items) {
        if (i.accelerator) out[i.label] = String(i.accelerator);
        if (i.submenu) walk(i.submenu.items);
      }
    };
    walk(Menu.getApplicationMenu()!.items);
    return out;
  });
  expect(accelerators).toMatchObject({
    'Send Request': 'CommandOrControl+Enter',
    'Save Request': 'CommandOrControl+S',
    'New Tab': 'CommandOrControl+T',
    'Close Tab': 'CommandOrControl+W',
    'Focus URL': 'CommandOrControl+L',
    'Find in Response': 'CommandOrControl+F',
    'Next Tab': 'Ctrl+Tab',
  });
  const roles = await app.evaluate(({ Menu }) => {
    const edit = Menu.getApplicationMenu()!.items.find((i) => i.label === 'Edit')!;
    return edit.submenu!.items.map((i) => i.role).filter(Boolean);
  });
  expect(roles).toEqual(expect.arrayContaining(['cut', 'copy', 'paste', 'selectall']));
});

test('shortcut actions work', async () => {
  const tabs = page.getByTestId('tab');
  const count = await tabs.count();

  await menuAction(app, 'newTab');
  await expect(tabs).toHaveCount(count + 1);
  await expect(urlText()).toBeFocused();

  await setUrl(page, `${server.url}/echo?via=shortcut`);
  await page.getByTestId('tab').first().click();
  await menuAction(app, 'focusUrl');
  await expect(urlText()).toBeFocused();

  await tabs.last().click();
  await menuAction(app, 'send');
  await expect(page.getByTestId('response-body')).toContainText('via=shortcut');

  await menuAction(app, 'searchResponse');
  await expect(page.locator('.cm-search')).toBeVisible();

  await menuAction(app, 'nextTab');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await menuAction(app, 'prevTab');
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');

  await menuAction(app, 'save');
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByLabel('New collection name').fill('Shortcuts');
  await page.getByTestId('save-confirm').click();
  await expect(tabs.last()).toHaveAttribute('data-dirty', 'false');

  await menuAction(app, 'closeTab');
  await expect(tabs).toHaveCount(count);
});
