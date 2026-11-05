import { useCollections } from '../stores/collections';
import { useEnvironments } from '../stores/environments';
import { useUi } from '../stores/ui';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Opens the import dialog and adds every SimpleRest collection, Postman collection and Postman
 * environment that could be read.
 */
export async function importCollections(): Promise<void> {
  const cols = useCollections.getState();
  const envs = useEnvironments.getState();
  const result = await window.api.importCollections({
    collectionNames: cols.collections.map((c) => c.name),
    environmentNames: envs.environments.map((e) => e.name),
  });
  if (result.canceled) return;
  cols.importMany(result.collections);
  envs.importMany(result.environments);

  const ui = useUi.getState();
  const warnings = result.errors.map((e) => `Couldn't import ${e}`);
  // Group notes per file so a big Postman import produces one readable warning.
  const byFile = new Map<string, string[]>();
  for (const note of result.notes) {
    const at = note.indexOf(': ');
    const file = note.slice(0, at);
    byFile.set(file, [...(byFile.get(file) ?? []), note.slice(at + 2)]);
  }
  for (const [file, notes] of byFile) {
    warnings.push(
      `${file} was imported with some changes:\n${notes.map((n) => `• ${n}`).join('\n')}`,
    );
  }
  if (warnings.length) ui.addWarnings(warnings);

  const nc = result.collections.length;
  const ne = result.environments.length;
  if (nc === 0 && ne === 0) return;
  const parts: string[] = [];
  if (nc) parts.push(nc === 1 ? `“${result.collections[0]!.name}”` : plural(nc, 'collection'));
  if (ne) parts.push(plural(ne, 'environment'));
  ui.notify(
    `Imported ${parts.join(' and ')}${result.includesSecrets ? '. It includes saved secrets.' : ''}`,
  );
}

export function exportCollection(collectionId: string): void {
  useUi.getState().openDialog({ kind: 'exportCollection', collectionId });
}
