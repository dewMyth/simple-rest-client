import { useState } from 'react';
import type { Auth } from '@shared/types';
import { useTabs, type Tab } from '../../stores/tabs';

const field =
  'h-8 w-full rounded-md border border-border bg-bg px-2 font-mono text-[12.5px] focus:border-accent focus:outline-none';

export function AuthEditor({ tab }: { tab: Tab }) {
  const { updateRequest } = useTabs.getState();
  const auth = tab.request.auth;
  const [showSecret, setShowSecret] = useState(false);
  const set = (a: Auth) => updateRequest(tab.id, { auth: a });
  const hasHeader = tab.request.headers.some(
    (h) => h.enabled && h.key.trim().toLowerCase() === 'authorization',
  );

  return (
    <div className="flex max-w-lg flex-col gap-3 p-4">
      <label className="flex items-center gap-3">
        <span className="w-20 text-fg-muted">Type</span>
        <select
          aria-label="Auth type"
          value={auth.type}
          onChange={(e) => {
            const t = e.target.value as Auth['type'];
            set(
              t === 'bearer'
                ? { type: 'bearer', token: '' }
                : t === 'basic'
                  ? { type: 'basic', username: '', password: '' }
                  : { type: 'none' },
            );
          }}
          className="h-8 rounded-md border border-border bg-bg px-2 text-[12.5px]"
        >
          <option value="none">No auth</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic</option>
        </select>
      </label>
      {auth.type === 'bearer' && (
        <label className="flex items-center gap-3">
          <span className="w-20 text-fg-muted">Token</span>
          <input
            className={field}
            type={showSecret ? 'text' : 'password'}
            value={auth.token}
            placeholder="{{token}}"
            aria-label="Bearer token"
            onChange={(e) => set({ type: 'bearer', token: e.target.value })}
          />
        </label>
      )}
      {auth.type === 'basic' && (
        <>
          <label className="flex items-center gap-3">
            <span className="w-20 text-fg-muted">Username</span>
            <input
              className={field}
              value={auth.username}
              aria-label="Username"
              onChange={(e) => set({ ...auth, username: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="w-20 text-fg-muted">Password</span>
            <input
              className={field}
              type={showSecret ? 'text' : 'password'}
              value={auth.password}
              aria-label="Password"
              onChange={(e) => set({ ...auth, password: e.target.value })}
            />
          </label>
        </>
      )}
      {auth.type !== 'none' && (
        <label className="ml-[92px] flex items-center gap-2 text-[12px] text-fg-muted">
          <input
            type="checkbox"
            checked={showSecret}
            onChange={(e) => setShowSecret(e.target.checked)}
            className="accent-accent"
          />
          Show secret
        </label>
      )}
      {auth.type !== 'none' && hasHeader && (
        <p className="text-[12px] text-warning">
          An Authorization header is set in Headers, so it will be used instead.
        </p>
      )}
      {auth.type === 'none' && (
        <p className="text-[12px] text-fg-faint">This request sends no auth.</p>
      )}
      <p className="text-[12px] text-fg-faint">
        Auth values support {'{{variables}}'}. They’re saved in plain text with your collections,
        and never written to history.
      </p>
    </div>
  );
}
