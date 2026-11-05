import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { join } from 'node:path';

/** Launches the built app. Strips ELECTRON_RUN_AS_NODE, which editors like VS Code set for their terminals. */
export async function launchApp(
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return electron.launch({
    args: [join(__dirname, '../../out/main/index.js')],
    env: { ...env, ...extraEnv },
  });
}
