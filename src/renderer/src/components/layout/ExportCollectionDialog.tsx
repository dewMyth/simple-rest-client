import { useState } from 'react';
import type { ExportFormat } from '@shared/ipc';
import { useCollections } from '../../stores/collections';
import { useUi } from '../../stores/ui';
import { Button, Modal } from '../common/Modal';

export function ExportCollectionDialog({ collectionId }: { collectionId: string }) {
  const close = useUi((s) => s.closeDialog);
  const collection = useCollections((s) => s.collections.find((c) => c.id === collectionId));
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('simplerest');
  const [busy, setBusy] = useState(false);
  if (!collection) return null;
  const count = collection.requests.length;

  const exportNow = async () => {
    setBusy(true);
    const res = await window.api.exportCollection(collection, includeSecrets, format);
    setBusy(false);
    if (res.saved) {
      close();
      useUi
        .getState()
        .notify(`Exported “${collection.name}”${format === 'postman' ? ' for Postman' : ''}`);
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
        Saves “{collection.name}” ({count} request{count === 1 ? '' : 's'}) as a JSON file.
      </p>
      <fieldset className="mb-4 flex flex-col gap-2" aria-label="Format">
        {(
          [
            [
              'simplerest',
              'SimpleRest',
              'Exact copy, for importing into SimpleRest on any computer.',
            ],
            [
              'postman',
              'Postman Collection v2.1',
              'For Postman and other tools that read Postman files. Timeouts aren’t included.',
            ],
          ] as const
        ).map(([id, label, hint]) => (
          <label key={id} className="flex items-start gap-2">
            <input
              type="radio"
              name="export-format"
              value={id}
              checked={format === id}
              onChange={() => setFormat(id)}
              className="mt-0.5 accent-accent"
              data-testid={`export-format-${id}`}
            />
            <span>
              <span className="block text-fg">{label}</span>
              <span className="text-[12px] text-fg-faint">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
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
