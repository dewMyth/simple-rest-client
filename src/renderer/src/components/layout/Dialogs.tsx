import { useState } from 'react';
import { requestTitle } from '../../lib/requests';
import { saveTab, saveTabAs } from '../../lib/saving';
import { useCollections } from '../../stores/collections';
import { useTabs } from '../../stores/tabs';
import { useUi, type Dialog } from '../../stores/ui';
import { Button, Modal } from '../common/Modal';
import { EnvironmentsDialog } from './EnvironmentsDialog';

const NEW = '__new__';
const fieldClass =
  'mt-1 h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] focus:border-accent focus:outline-none';

function SaveDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'save' }> }) {
  const close = useUi((s) => s.closeDialog);
  const tab = useTabs((s) => s.tabs.find((t) => t.id === dialog.tabId));
  const collections = useCollections((s) => s.collections);
  const [name, setName] = useState(() => (tab ? requestTitle(tab.request) : ''));
  const [target, setTarget] = useState(collections[0]?.id ?? NEW);
  const [newName, setNewName] = useState('');
  if (!tab) return null;

  const submit = () => {
    saveTabAs(
      tab.id,
      name,
      target === NEW ? { newCollectionName: newName } : { collectionId: target },
    );
    close();
    if (dialog.thenClose) useTabs.getState().closeTab(tab.id);
  };

  return (
    <Modal
      title="Save request"
      onClose={close}
      testId="save-dialog"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={submit} testId="save-confirm">
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-3"
      >
        <label className="text-[12px] text-fg-muted">
          Name
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Request name"
          />
        </label>
        <label className="text-[12px] text-fg-muted">
          Collection
          <select
            className={fieldClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Collection"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>New collection…</option>
          </select>
        </label>
        {target === NEW && (
          <label className="text-[12px] text-fg-muted">
            New collection name
            <input
              className={fieldClass}
              value={newName}
              placeholder="My API"
              onChange={(e) => setNewName(e.target.value)}
              aria-label="New collection name"
            />
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CloseTabDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'closeTab' }> }) {
  const close = useUi((s) => s.closeDialog);
  const tab = useTabs((s) => s.tabs.find((t) => t.id === dialog.tabId));
  if (!tab) return null;
  return (
    <Modal
      title="Save changes?"
      onClose={close}
      testId="close-dialog"
      footer={
        <>
          <Button onClick={close} testId="close-cancel">
            Cancel
          </Button>
          <Button
            testId="close-discard"
            onClick={() => {
              close();
              useTabs.getState().closeTab(tab.id);
            }}
          >
            Don’t save
          </Button>
          <Button
            variant="primary"
            testId="close-save"
            onClick={() => {
              close();
              saveTab(tab.id, true);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">
        “{requestTitle(tab.request)}” has unsaved changes. They’ll be lost if you close it without
        saving.
      </p>
    </Modal>
  );
}

function ConfirmDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'confirm' }> }) {
  const close = useUi((s) => s.closeDialog);
  return (
    <Modal
      title={dialog.title}
      onClose={close}
      testId="confirm-dialog"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant={dialog.danger ? 'danger' : 'primary'}
            testId="confirm-ok"
            onClick={() => {
              close();
              dialog.onConfirm();
            }}
          >
            {dialog.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">{dialog.message}</p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'save':
      return <SaveDialog key={dialog.tabId} dialog={dialog} />;
    case 'closeTab':
      return <CloseTabDialog dialog={dialog} />;
    case 'confirm':
      return <ConfirmDialog dialog={dialog} />;
    case 'environments':
      return <EnvironmentsDialog initialId={dialog.selectedId} />;
  }
}

export function Warnings() {
  const warnings = useUi((s) => s.warnings);
  const notice = useUi((s) => s.notice);
  const dismiss = useUi((s) => s.dismissWarning);
  if (warnings.length === 0 && !notice) return null;
  return (
    <div
      className="pointer-events-none fixed right-3 bottom-3 z-40 flex max-w-md flex-col gap-2"
      data-testid="warnings"
    >
      {notice && (
        <div
          role="status"
          data-testid="notice"
          className="pointer-events-auto self-end rounded-md bg-fg px-3 py-2 text-[12.5px] text-bg shadow-lg"
        >
          {notice}
        </div>
      )}
      {warnings.map((w, i) => (
        <div
          key={i}
          role="alert"
          className="pointer-events-auto flex items-start gap-3 rounded-md border border-border bg-bg-subtle p-3 text-[12.5px] shadow-lg"
        >
          <span className="flex-1 text-fg">{w}</span>
          <button
            onClick={() => dismiss(i)}
            className="text-fg-muted hover:text-fg"
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
