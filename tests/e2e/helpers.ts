import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function tempDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'simplerest-e2e-'));
}

/**
 * Launches the built app with its own data folder. Strips ELECTRON_RUN_AS_NODE, which editors
 * like VS Code set for their terminals.
 */
export async function launchApp(dataDir: string = tempDataDir()): Promise<ElectronApplication> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return electron.launch({
    // The project root, so Electron reads package.json (name, version, main) like a packaged app.
    args: [join(__dirname, '../..')],
    env: { ...env, SIMPLEREST_USER_DATA: dataDir },
  });
}

export async function setUrl(page: Page, url: string): Promise<void> {
  const editor = page.locator('[data-testid="url-input"] .cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(url);
}

export async function sendAndWait(page: Page): Promise<void> {
  await page.getByTestId('send-button').click();
  await page.waitForSelector('[data-testid="response-view"], [data-testid="response-error"]');
}

/** Triggers a native menu action the way its accelerator would. */
export async function menuAction(
  app: import('@playwright/test').ElectronApplication,
  action: string,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, a) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('menu:action', a);
  }, action);
}

export async function openApp(dataDir: string) {
  const app = await launchApp(dataDir);
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="app-root"]');
  return { app, page };
}
