import { useEffect, useState } from 'react';
import { useEnvironments } from '../../stores/environments';
import { useUi } from '../../stores/ui';
import { KeyValueTable } from '../common/KeyValueTable';
import { Button } from '../common/Modal';
import { PlusIcon } from '../common/icons';
import { InlineRename } from '../sidebar/InlineRename';

export function EnvironmentsDialog({ initialId }: { initialId: string | null }) {
  const close = useUi((s) => s.closeDialog);
  const environments = useEnvironments((s) => s.environments);
  const activeId = useEnvironments((s) => s.activeId);
  const store = useEnvironments.getState();
  const [selectedId, setSelectedId] = useState(initialId ?? environments[0]?.id ?? null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const selected = environments.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !renaming && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, renaming]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Environments"
        data-testid="environments-dialog"
        className="flex h-[70vh] w-[820px] max-w-[94vw] flex-col rounded-lg border border-border bg-bg shadow-xl"
      >
        <div className="flex items-center border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-semibold">Environments</h2>
          <span className="ml-3 text-[12px] text-fg-faint">
            Use variables as {'{{name}}'} in URLs, headers, bodies and auth.
          </span>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-56 shrink-0 flex-col border-r border-border bg-bg-subtle">
            <ul className="min-h-0 flex-1 overflow-auto py-1">
              {environments.map((e) => (
                <li
                  key={e.id}
                  data-testid="env-item"
                  onClick={() => setSelectedId(e.id)}
                  onDoubleClick={() => setRenaming(e.id)}
                  className={`flex h-7 cursor-default items-center gap-2 px-3 text-[12.5px] ${
                    e.id === selectedId ? 'bg-bg-muted text-fg' : 'text-fg-muted hover:bg-bg-hover'
                  }`}
                >
                  {renaming === e.id ? (
                    <InlineRename
                      value={e.name}
                      onCommit={(name) => {
                        store.rename(e.id, name);
                        setRenaming(null);
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <span className="flex-1 truncate">{e.name}</span>
                  )}
                  {e.id === activeId && <span className="text-[10.5px] text-success">active</span>}
                </li>
              ))}
              {environments.length === 0 && (
                <li className="px-3 py-2 text-[12px] text-fg-faint">No environments yet.</li>
              )}
            </ul>
            <button
              data-testid="new-environment"
              onClick={() => {
                const env = store.create('New Environment');
                setSelectedId(env.id);
                setRenaming(env.id);
              }}
              className="flex h-9 items-center gap-1.5 border-t border-border px-3 text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              <PlusIcon /> New environment
            </button>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <span className="truncate font-medium">{selected.name}</span>
                  <div className="ml-auto flex gap-1.5">
                    <Button onClick={() => setRenaming(selected.id)}>Rename</Button>
                    <Button
                      onClick={() => {
                        const copy = store.duplicate(selected.id);
                        if (copy) setSelectedId(copy.id);
                      }}
                    >
                      Duplicate
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        store.remove(selected.id);
                        setSelectedId(environments.find((e) => e.id !== selected.id)?.id ?? null);
                      }}
                    >
                      Delete
                    </Button>
                    {selected.id !== activeId && (
                      <Button
                        variant="primary"
                        onClick={() => store.setActive(selected.id)}
                        testId="env-activate"
                      >
                        Use this environment
                      </Button>
                    )}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <KeyValueTable
                    label="Variables"
                    rows={selected.variables}
                    keyPlaceholder="Variable"
                    onChange={(rows) => store.setVariables(selected.id, rows)}
                  />
                </div>
              </>
            ) : (
              <p className="m-auto text-fg-faint">Create an environment to define variables.</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border bg-bg-subtle px-4 py-3">
          <span className="text-[12px] text-fg-faint">
            Values are stored in plain text in your local data folder.
          </span>
          <Button variant="primary" onClick={close} testId="env-done">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
