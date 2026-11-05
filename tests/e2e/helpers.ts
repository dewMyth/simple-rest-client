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
    args: [join(__dirname, '../../out/main/index.js')],
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
