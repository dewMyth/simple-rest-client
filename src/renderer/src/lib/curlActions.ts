import { CurlParseError, looksLikeCurl, parseCurl, toCurl } from '@shared/curl';
import { resolveRequest } from '@shared/variables';
import { activeVariables } from '../stores/environments';
import { useTabs } from '../stores/tabs';
import { useUi } from '../stores/ui';
import { newId } from './id';
import { toSpec } from './requests';

/** URL bar paste handler. Returns true when the paste was a cURL command and was imported. */
export function importCurlPaste(text: string): boolean {
  if (!looksLikeCurl(text)) return false;
  const tabs = useTabs.getState();
  try {
    const spec = parseCurl(text, newId);
    tabs.replaceSpec(tabs.activeId, spec);
    const hasFile =
      spec.body.type === 'multipart' && spec.body.fields.some((f) => f.kind === 'file');
    useUi
      .getState()
      .notify(
        hasFile ? 'Imported cURL. Choose files for file fields again.' : 'Imported cURL command',
      );
  } catch (err) {
    const msg = err instanceof CurlParseError ? err.message : (err as Error).message;
    useUi.getState().addWarnings([`Couldn't import the cURL command: ${msg}.`]);
  }
  return true;
}

/** Copies the active request as a cURL command, with environment variables filled in. */
export function copyAsCurl(tabId: string): void {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const { request, missing } = resolveRequest(toSpec(tab.request), activeVariables());
  void window.api.copyText(toCurl(request)).then(() => {
    useUi
      .getState()
      .notify(
        missing.length ? `Copied as cURL (unresolved: ${missing.join(', ')})` : 'Copied as cURL',
      );
  });
}
