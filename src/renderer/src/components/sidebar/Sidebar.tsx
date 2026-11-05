import { useState } from 'react';
import { useCollections } from '../../stores/collections';
import { useUi } from '../../stores/ui';
import { PlusIcon } from '../common/icons';
import { CollectionsList } from './CollectionsList';
import { HistoryList } from './HistoryList';

type View = 'collections' | 'history';

export function Sidebar() {
  const [view, setView] = useState<View>('collections');
  const newCollection = () => {
    const c = useCollections.getState().create('New Collection');
    useUi.getState().setRenaming({ collectionId: c.id });
  };
  return (
    <div className="flex h-full flex-col bg-bg-subtle">
      <div
        className="flex h-9 shrink-0 items-center gap-1 border-b border-border pr-1 pl-2"
        role="tablist"
        aria-label="Sidebar"
      >
        {(['collections', 'history'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            data-testid={`sidebar-${v}`}
            onClick={() => setView(v)}
            className={`rounded px-2 py-1 text-[12px] font-medium tracking-wide uppercase ${
              view === v ? 'bg-bg-muted text-fg' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {v}
          </button>
        ))}
        {view === 'collections' && (
          <button
            aria-label="New collection"
            data-testid="new-collection"
            onClick={newCollection}
            className="ml-auto rounded p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            <PlusIcon />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {view === 'collections' ? <CollectionsList /> : <HistoryList />}
      </div>
    </div>
  );
}
