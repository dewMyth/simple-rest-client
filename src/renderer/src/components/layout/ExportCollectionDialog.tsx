import { useState } from 'react';
import { useCollections } from '../../stores/collections';
import { useUi } from '../../stores/ui';
import { Button, Modal } from '../common/Modal';

export function ExportCollectionDialog({ collectionId }: { collectionId: string }) {
  const close = useUi((s) => s.closeDialog);
  const collection = useCollections((s) => s.collections.find((c) => c.id === collectionId));
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!collection) return null;
  const count = collection.requests.length;

  const exportNow = async () => {
    setBusy(true);
    const res = await window.api.exportCollection(collection, includeSecrets);
    setBusy(false);
    if (res.saved) {
      close();
      useUi.getState().notify(`Exported “${collection.name}”`);
    } else if (res.error) {
      useUi.getState().addWarnings([res.error]);
    }
  };

  return (
    <Modal
      title="Export collection"
      onClose={close}
      testId="export-dialog"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void exportNow()}
            disabled={busy}
            testId="export-confirm"
          >
            Export…
          </Button>
        </>
      }
    >
      <p className="mb-3 text-fg-muted">
        Saves “{collection.name}” ({count} request{count === 1 ? '' : 's'}) as a JSON file you can
        import into SimpleRest on any computer.
      </p>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={includeSecrets}
          onChange={(e) => setIncludeSecrets(e.target.checked)}
          className="mt-0.5 accent-accent"
          data-testid="export-include-secrets"
        />
        <span>
          <span className="block text-fg">Include secrets</span>
          <span className="text-[12px] text-fg-faint">
            Bearer tokens, Basic passwords, and Authorization, Cookie, Proxy-Authorization and
            X-Api-Key header values.
          </span>
        </span>
      </label>
      {includeSecrets && (
        <p className="mt-3 text-[12px] text-warning" data-testid="export-secrets-warning">
          Anyone with this file can use these credentials. Only share it with people you trust.
        </p>
      )}
      <p className="mt-3 text-[12px] text-fg-faint">
        File paths in multipart fields are never exported.
      </p>
    </Modal>
  );
}
