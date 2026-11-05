import type { HistoryEntry } from '@shared/types';
import { statusClass } from '../../lib/format';
import { newId } from '../../lib/id';
import { methodColor, methodShort } from '../../lib/methods';
import { createRequest } from '../../lib/requests';
import { useHistory } from '../../stores/history';
import { useTabs } from '../../stores/tabs';
import { useUi } from '../../stores/ui';

const STATUS_COLORS = {
  success: 'text-success',
  redirect: 'text-info',
  client: 'text-warning',
  server: 'text-danger',
  info: 'text-fg-muted',
};

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function open(entry: HistoryEntry): void {
  const r = entry.request;
  // History never has auth values, so the user enters them again.
  useTabs.getState().newTab(
    createRequest({
      method: r.method,
      url: r.url,
      headers: r.headers.map((h) => ({ ...h, id: newId() })),
      body: structuredClone(r.body),
      auth: r.auth,
      options: r.options,
    }),
  );
}

export function HistoryList() {
  const entries = useHistory((s) => s.entries);
  if (entries.length === 0) {
    return (
      <p className="p-4 text-[12.5px] text-fg-faint" data-testid="history-empty">
        Requests you send appear here. The last 200 are kept, without auth values or response
        bodies.
      </p>
    );
  }
  const days = entries.map((e) => dayLabel(e.sentAt));
  return (
    <div className="flex h-full flex-col">
      <ul className="min-h-0 flex-1 overflow-auto py-1" data-testid="history">
        {entries.map((e, i) => {
          const day = days[i]!;
          const header = i === 0 || days[i - 1] !== day;
          return (
            <li key={e.id}>
              {header && (
                <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-fg-faint uppercase">
                  {day}
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                data-testid="history-item"
                onClick={() => open(e)}
                onKeyDown={(ev) => ev.key === 'Enter' && open(e)}
                title={`${e.request.method} ${e.request.url}\n${new Date(e.sentAt).toLocaleString()}${e.error ? `\n${e.error}` : ''}`}
                className="group flex h-7 cursor-default items-center gap-2 px-3 text-[12.5px] text-fg-muted hover:bg-bg-hover"
              >
                <span
                  className="w-8 shrink-0 font-mono text-[10.5px] font-semibold"
                  style={{ color: methodColor(e.request.method) }}
                >
                  {methodShort(e.request.method)}
                </span>
                <span className="flex-1 truncate font-mono text-[12px]">
                  {e.request.url.replace(/^https?:\/\//, '')}
                </span>
                {e.status !== null ? (
                  <span className={`text-[11px] ${STATUS_COLORS[statusClass(e.status)]}`}>
                    {e.status}
                  </span>
                ) : (
                  <span className="text-[11px] text-danger">ERR</span>
                )}
                <button
                  aria-label="Remove from history"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    useHistory.getState().remove(e.id);
                  }}
                  className="hidden text-fg-faint group-hover:block hover:text-fg"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        data-testid="clear-history"
        onClick={() =>
          useUi.getState().openDialog({
            kind: 'confirm',
            title: 'Clear history?',
            message: 'All history entries will be removed. Saved requests are not affected.',
            confirmLabel: 'Clear history',
            danger: true,
            onConfirm: () => useHistory.getState().clear(),
          })
        }
        className="h-9 shrink-0 border-t border-border text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
      >
        Clear history
      </button>
    </div>
  );
}
