import { useState, type DragEvent } from 'react';
import type { Collection } from '@shared/types';
import { methodColor, methodShort } from '../../lib/methods';
import { createRequest, requestTitle } from '../../lib/requests';
import { useCollections } from '../../stores/collections';
import { useActiveTab, useTabs } from '../../stores/tabs';
import { useUi } from '../../stores/ui';
import { ChevronIcon, MoreIcon } from '../common/icons';
import { Menu } from '../common/Menu';
import { InlineRename } from './InlineRename';

const REQ_MIME = 'application/x-simplerest-request';
const COL_MIME = 'application/x-simplerest-collection';

interface DragReq {
  collectionId: string;
  requestId: string;
}

function readDrag(e: DragEvent): { req?: DragReq; col?: string } {
  const req = e.dataTransfer.getData(REQ_MIME);
  const col = e.dataTransfer.getData(COL_MIME);
  return { req: req ? (JSON.parse(req) as DragReq) : undefined, col: col || undefined };
}

const accepts = (e: DragEvent) =>
  e.dataTransfer.types.includes(REQ_MIME) || e.dataTransfer.types.includes(COL_MIME);

export function CollectionsList() {
  const collections = useCollections((s) => s.collections);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (collections.length === 0) {
    return (
      <div className="p-4 text-[12.5px] text-fg-faint" data-testid="collections-empty">
        <p>No collections yet.</p>
        <p className="mt-1">
          Press{' '}
          <kbd className="font-mono">{navigator.userAgent.includes('Mac') ? '⌘S' : 'Ctrl+S'}</kbd>{' '}
          to save the current request, or use + to create one.
        </p>
      </div>
    );
  }

  return (
    <ul className="py-1" data-testid="collections">
      {collections.map((c) => (
        <CollectionItem
          key={c.id}
          collection={c}
          open={!collapsed.has(c.id)}
          toggle={() =>
            setCollapsed((s) => {
              const n = new Set(s);
              if (n.has(c.id)) n.delete(c.id);
              else n.add(c.id);
              return n;
            })
          }
        />
      ))}
    </ul>
  );
}

function CollectionItem({
  collection: c,
  open,
  toggle,
}: {
  collection: Collection;
  open: boolean;
  toggle: () => void;
}) {
  const cols = useCollections.getState();
  const renaming = useUi((s) => s.renaming);
  const { setRenaming, openDialog } = useUi.getState();
  const isRenaming = renaming?.collectionId === c.id && !renaming.requestId;
  const [dropHint, setDropHint] = useState(false);

  const addRequest = () => {
    const request = createRequest({ name: 'New request' });
    cols.addRequest(c.id, request);
    useTabs.getState().openSaved(request, { collectionId: c.id, requestId: request.id });
    setRenaming({ collectionId: c.id, requestId: request.id });
  };

  return (
    <li data-testid="collection" data-name={c.name}>
      <div
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(COL_MIME, c.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!accepts(e)) return;
          e.preventDefault();
          setDropHint(true);
        }}
        onDragLeave={() => setDropHint(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropHint(false);
          const { req, col } = readDrag(e);
          if (col) cols.reorder(col, c.id);
          if (req) cols.moveRequest(req.collectionId, req.requestId, c.id, null);
        }}
        onClick={toggle}
        className={`group flex h-7 cursor-default items-center gap-1 px-2 text-[12.5px] font-medium hover:bg-bg-hover ${
          dropHint ? 'shadow-[inset_0_2px_0_var(--accent)]' : ''
        }`}
      >
        <ChevronIcon
          className={`shrink-0 text-fg-faint transition-transform ${open ? 'rotate-90' : ''}`}
          width={12}
          height={12}
        />
        {isRenaming ? (
          <InlineRename
            value={c.name}
            onCommit={(name) => {
              cols.rename(c.id, name);
              setRenaming(null);
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <span className="flex-1 truncate" data-testid="collection-name">
            {c.name}
          </span>
        )}
        <span className="text-[11px] text-fg-faint group-hover:hidden">
          {c.requests.length || ''}
        </span>
        <span className="hidden group-hover:block has-[[aria-expanded=true]]:block">
          <Menu
            label={`Actions for ${c.name}`}
            testId="collection-menu"
            trigger={<MoreIcon />}
            items={[
              { label: 'Add request', onSelect: addRequest },
              { label: 'Rename', onSelect: () => setRenaming({ collectionId: c.id }) },
              { label: 'Duplicate', onSelect: () => cols.duplicate(c.id) },
              {
                label: 'Delete',
                danger: true,
                onSelect: () =>
                  openDialog({
                    kind: 'confirm',
                    title: 'Delete collection?',
                    message: `“${c.name}” and its ${c.requests.length} request${c.requests.length === 1 ? '' : 's'} will be deleted. Open tabs keep their drafts.`,
                    confirmLabel: 'Delete',
                    danger: true,
                    onConfirm: () => cols.remove(c.id),
                  }),
              },
            ]}
          />
        </span>
      </div>
      {open && (
        <ul>
          {c.requests.map((r) => (
            <RequestItem key={r.id} collectionId={c.id} requestId={r.id} />
          ))}
          {c.requests.length === 0 && (
            <li className="py-1 pr-2 pl-7 text-[12px] text-fg-faint">Empty</li>
          )}
        </ul>
      )}
    </li>
  );
}

function RequestItem({ collectionId, requestId }: { collectionId: string; requestId: string }) {
  const r = useCollections((s) => s.find(collectionId, requestId));
  const active = useActiveTab();
  const renaming = useUi((s) => s.renaming);
  const { setRenaming, openDialog } = useUi.getState();
  const [dropHint, setDropHint] = useState(false);
  if (!r) return null;
  const cols = useCollections.getState();
  const ref = { collectionId, requestId };
  const isActive =
    active.savedRef?.collectionId === collectionId && active.savedRef.requestId === requestId;
  const isRenaming = renaming?.collectionId === collectionId && renaming.requestId === requestId;

  return (
    <li
      data-testid="saved-request"
      data-name={r.name}
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(REQ_MIME, JSON.stringify(ref));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(REQ_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropHint(true);
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropHint(false);
        const { req } = readDrag(e);
        if (req) cols.moveRequest(req.collectionId, req.requestId, collectionId, requestId);
      }}
      onClick={() => useTabs.getState().openSaved(r, ref)}
      className={`group flex h-7 cursor-default items-center gap-2 pr-2 pl-7 text-[12.5px] ${
        isActive ? 'bg-bg-muted text-fg' : 'text-fg-muted hover:bg-bg-hover'
      } ${dropHint ? 'shadow-[inset_0_2px_0_var(--accent)]' : ''}`}
    >
      <span
        className="w-8 shrink-0 font-mono text-[10.5px] font-semibold"
        style={{ color: methodColor(r.method) }}
      >
        {methodShort(r.method)}
      </span>
      {isRenaming ? (
        <InlineRename
          value={r.name}
          onCommit={(name) => {
            cols.renameRequest(collectionId, requestId, name);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      ) : (
        <span className="flex-1 truncate">{requestTitle(r)}</span>
      )}
      <span className="hidden group-hover:block has-[[aria-expanded=true]]:block">
        <Menu
          label={`Actions for ${requestTitle(r)}`}
          testId="request-menu"
          trigger={<MoreIcon />}
          items={[
            { label: 'Rename', onSelect: () => setRenaming({ collectionId, requestId }) },
            { label: 'Duplicate', onSelect: () => cols.duplicateRequest(collectionId, requestId) },
            {
              label: 'Delete',
              danger: true,
              onSelect: () =>
                openDialog({
                  kind: 'confirm',
                  title: 'Delete request?',
                  message: `“${requestTitle(r)}” will be deleted from this collection.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => cols.removeRequest(collectionId, requestId),
                }),
            },
          ]}
        />
      </span>
    </li>
  );
}
