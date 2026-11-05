import { useCollections } from '../stores/collections';
import { useUi } from '../stores/ui';

/** Opens the import dialog and adds every collection that could be read. */
export async function importCollections(): Promise<void> {
  const cols = useCollections.getState();
  const result = await window.api.importCollections(cols.collections.map((c) => c.name));
  if (result.canceled) return;
  cols.importMany(result.collections);
  const ui = useUi.getState();
  if (result.errors.length) ui.addWarnings(result.errors.map((e) => `Couldn't import ${e}`));
  const n = result.collections.length;
  if (n > 0) {
    const what = n === 1 ? `“${result.collections[0]!.name}”` : `${n} collections`;
    ui.notify(
      result.includesSecrets ? `Imported ${what}. It includes saved secrets.` : `Imported ${what}`,
    );
  }
}

export function exportCollection(collectionId: string): void {
  useUi.getState().openDialog({ kind: 'exportCollection', collectionId });
}
