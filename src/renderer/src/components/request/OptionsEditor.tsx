import { useTabs, type Tab } from '../../stores/tabs';

export function OptionsEditor({ tab }: { tab: Tab }) {
  const { updateRequest } = useTabs.getState();
  const o = tab.request.options;
  const set = (patch: Partial<typeof o>) => updateRequest(tab.id, { options: { ...o, ...patch } });

  return (
    <div className="flex max-w-md flex-col gap-4 p-4">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-fg">Timeout</span>
          <span className="text-[12px] text-fg-faint">Milliseconds. 0 means no timeout.</span>
        </span>
        <input
          type="number"
          min={0}
          step={1000}
          value={o.timeoutMs}
          onChange={(e) => set({ timeoutMs: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          className="h-7 w-28 rounded border border-border bg-bg px-2 text-right font-mono text-[12.5px] focus:border-accent focus:outline-none"
          aria-label="Timeout in milliseconds"
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-fg">Follow redirects</span>
          <span className="text-[12px] text-fg-faint">Up to 10 hops.</span>
        </span>
        <input
          type="checkbox"
          checked={o.followRedirects}
          onChange={(e) => set({ followRedirects: e.target.checked })}
          className="accent-accent"
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-fg">Verify TLS certificates</span>
          <span className="text-[12px] text-fg-faint">
            Turn off only for servers you trust, such as local dev.
          </span>
        </span>
        <input
          type="checkbox"
          checked={o.verifyTls}
          onChange={(e) => set({ verifyTls: e.target.checked })}
          className="accent-accent"
          aria-label="Verify TLS certificates"
        />
      </label>
    </div>
  );
}
