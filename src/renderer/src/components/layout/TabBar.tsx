import type { ReactNode } from 'react';
import { methodColor, methodShort } from '../../lib/methods';
import { requestTitle } from '../../lib/requests';
import { isDirty, useTabs } from '../../stores/tabs';
import { PlusIcon, XIcon } from '../common/icons';

export function TabBar({ onClose, right }: { onClose: (id: string) => void; right?: ReactNode }) {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const { setActive, newTab } = useTabs.getState();

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-border bg-bg-subtle">
      <div
        role="tablist"
        aria-label="Open requests"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-none"
      >
        {tabs.map((t) => {
          const active = t.id === activeId;
          const dirty = isDirty(t);
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              data-testid="tab"
              data-dirty={dirty}
              onClick={() => setActive(t.id)}
              onAuxClick={(e) => e.button === 1 && onClose(t.id)}
              onKeyDown={(e) => e.key === 'Enter' && setActive(t.id)}
              className={`group flex max-w-[220px] min-w-[120px] cursor-default items-center gap-1.5 border-r border-border px-3 text-[12.5px] ${
                active ? 'bg-bg text-fg' : 'text-fg-muted hover:bg-bg-hover'
              }`}
            >
              <span
                className="shrink-0 font-mono text-[10.5px] font-semibold"
                style={{ color: methodColor(t.request.method) }}
              >
                {methodShort(t.request.method)}
              </span>
              <span className="truncate">{requestTitle(t.request)}</span>
              <span className="relative ml-auto flex h-4 w-4 shrink-0 items-center justify-center">
                {dirty && (
                  <span
                    className="absolute h-2 w-2 rounded-full bg-fg-muted group-focus-within:hidden group-hover:hidden"
                    aria-label="Unsaved changes"
                    data-testid="dirty-indicator"
                  />
                )}
                <button
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(t.id);
                  }}
                  className={`absolute rounded p-0.5 hover:bg-bg-hover ${dirty || !active ? 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100' : ''}`}
                >
                  <XIcon width={12} height={12} />
                </button>
              </span>
            </div>
          );
        })}
        <button
          aria-label="New tab"
          onClick={() => newTab()}
          className="flex w-9 shrink-0 items-center justify-center text-fg-muted hover:bg-bg-hover hover:text-fg"
          data-testid="new-tab"
        >
          <PlusIcon />
        </button>
      </div>
      {right && (
        <div className="flex shrink-0 items-center border-l border-border px-2">{right}</div>
      )}
    </div>
  );
}
