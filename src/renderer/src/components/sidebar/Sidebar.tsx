import { useCollections } from '../../stores/collections';
import { useUi } from '../../stores/ui';
import { PlusIcon } from '../common/icons';
import { CollectionsList } from './CollectionsList';

export function Sidebar() {
  const newCollection = () => {
    const c = useCollections.getState().create('New Collection');
    useUi.getState().setRenaming({ collectionId: c.id });
  };
  return (
    <div className="flex h-full flex-col bg-bg-subtle">
      <div className="flex h-9 shrink-0 items-center border-b border-border pr-1 pl-3">
        <span className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">
          Collections
        </span>
        <button
          aria-label="New collection"
          data-testid="new-collection"
          onClick={newCollection}
          className="ml-auto rounded p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <PlusIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CollectionsList />
      </div>
    </div>
  );
}
