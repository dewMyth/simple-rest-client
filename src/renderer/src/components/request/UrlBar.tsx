import { HTTP_METHODS, type HttpMethod } from '@shared/types';
import { editors } from '../../lib/editors';
import { methodColor } from '../../lib/methods';
import { useTabs, type Tab } from '../../stores/tabs';
import { useKnownVariables } from '../../stores/variables';
import { CodeEditor } from '../common/CodeEditor';
import { MoreIcon, WarningIcon } from '../common/icons';
import { Menu } from '../common/Menu';
import { copyAsCurl } from '../../lib/curlActions';

export function UrlBar({ tab, onPasteUrl }: { tab: Tab; onPasteUrl?: (text: string) => boolean }) {
  const { updateRequest, setUrl, send, cancel } = useTabs.getState();
  const known = useKnownVariables();
  const sending = tab.response.status === 'sending';
  const { method, url, options } = tab.request;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
      <div className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-bg-subtle focus-within:border-accent">
        <select
          aria-label="HTTP method"
          value={method}
          onChange={(e) => updateRequest(tab.id, { method: e.target.value as HttpMethod })}
          className="h-8 cursor-pointer rounded-l-md border-r border-border bg-transparent pl-2.5 pr-1 font-mono text-[12.5px] font-semibold focus:outline-none"
          style={{ color: methodColor(method) }}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} style={{ color: 'var(--fg)' }}>
              {m}
            </option>
          ))}
        </select>
        <CodeEditor
          key={tab.id}
          className="min-w-0 flex-1 overflow-hidden px-1 [&_.cm-content]:py-[7px] [&_.cm-scroller]:overflow-x-auto [&_.cm-scroller]:scrollbar-none"
          value={url}
          onChange={(v) => setUrl(tab.id, v)}
          multiline={false}
          variables={known}
          placeholder="Enter a URL or paste a cURL command"
          onEnter={() => void send(tab.id)}
          onPaste={onPasteUrl ? (text) => onPasteUrl(text) : undefined}
          onView={(v) => (editors.url = v)}
          testId="url-input"
          ariaLabel="Request URL"
        />
      </div>
      {!options.verifyTls && (
        <span
          title="TLS certificate verification is off for this request"
          className="flex items-center gap-1 text-[11.5px] text-warning"
          data-testid="tls-warning"
        >
          <WarningIcon /> TLS off
        </span>
      )}
      {sending ? (
        <button
          onClick={() => cancel(tab.id)}
          className="h-8 min-w-[76px] rounded-md border border-border bg-bg-muted px-4 text-[12.5px] font-medium hover:bg-bg-hover"
          data-testid="cancel-button"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={() => void send(tab.id)}
          className="h-8 min-w-[76px] rounded-md bg-accent px-4 text-[12.5px] font-medium text-accent-fg hover:opacity-90"
          data-testid="send-button"
        >
          Send
        </button>
      )}
      <Menu
        label="More request actions"
        testId="request-actions"
        trigger={<MoreIcon />}
        items={[{ label: 'Copy as cURL', onSelect: () => copyAsCurl(tab.id) }]}
      />
    </div>
  );
}
