import { openSearchPanel } from '@codemirror/search';
import { useEffect, useMemo, useState } from 'react';
import type { ResponseResult, SendError } from '@shared/types';
import { editors } from '../../lib/editors';
import {
  formatBytes,
  formatDuration,
  looksLikeJson,
  prettyJson,
  statusClass,
} from '../../lib/format';
import { useTabs, type ResponseSection, type Tab } from '../../stores/tabs';
import { CodeEditor } from '../common/CodeEditor';
import { CopyIcon, SaveIcon, SearchIcon } from '../common/icons';
import { Segmented, SectionTabs } from '../common/SectionTabs';

const STATUS_COLORS = {
  success: 'text-success',
  redirect: 'text-info',
  client: 'text-warning',
  server: 'text-danger',
  info: 'text-fg-muted',
};

const ERROR_TITLES: Record<SendError['kind'], string> = {
  unresolved: 'Unresolved variables',
  invalidUrl: 'Invalid URL',
  invalidRequest: 'Invalid request',
  file: 'File problem',
  dns: 'Host not found',
  refused: 'Connection refused',
  tls: 'TLS error',
  timeout: 'Timed out',
  cancelled: 'Cancelled',
  tooManyRedirects: 'Too many redirects',
  tooLarge: 'Response too large',
  network: 'Network error',
};

export function ResponsePane({ tab }: { tab: Tab }) {
  const r = tab.response;
  if (r.status === 'idle') return <EmptyState />;
  if (r.status === 'sending')
    return <Sending startedAt={r.startedAt} onCancel={() => useTabs.getState().cancel(tab.id)} />;
  if (r.status === 'error') return <ErrorView error={r.error} />;
  return <ResponseView tab={tab} response={r.response} />;
}

function EmptyState() {
  const mod = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl+';
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-1 text-fg-faint"
      data-testid="response-empty"
    >
      <p>Send a request to see the response here.</p>
      <p className="text-[12px]">
        <kbd className="font-mono">{mod}Enter</kbd> sends · <kbd className="font-mono">{mod}L</kbd>{' '}
        focuses the URL
      </p>
    </div>
  );
}

function Sending({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 text-fg-muted"
      data-testid="response-sending"
    >
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
      <p>Sending… {formatDuration(Math.max(0, now - startedAt))}</p>
      <button
        onClick={onCancel}
        className="rounded border border-border px-3 py-1 text-[12px] hover:bg-bg-hover"
      >
        Cancel
      </button>
    </div>
  );
}

function ErrorView({ error }: { error: SendError }) {
  return (
    <div
      className="flex h-full items-start justify-center overflow-auto p-8"
      data-testid="response-error"
    >
      <div className="max-w-lg rounded-md border border-border bg-bg-subtle p-4">
        <p
          className={`mb-1 font-medium ${error.kind === 'cancelled' ? 'text-fg' : 'text-danger'}`}
          data-testid="error-title"
        >
          {ERROR_TITLES[error.kind]}
        </p>
        <p className="text-fg-muted select-text" data-testid="error-message">
          {error.message}
        </p>
        {error.missing && error.missing.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {error.missing.map((m) => (
              <li
                key={m}
                className="rounded bg-bg-muted px-1.5 py-0.5 font-mono text-[12px] text-danger"
              >
                {`{{${m}}}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IconButton(props: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      data-testid={props.testId}
      className="rounded p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      {props.children}
    </button>
  );
}

function ResponseView({ tab, response }: { tab: Tab; response: ResponseResult }) {
  const { setUi } = useTabs.getState();
  const [notice, setNotice] = useState<string | null>(null);
  const isJson = !response.isBinary && looksLikeJson(response.bodyText, response.contentType);
  const pretty = useMemo(
    () => (isJson && !response.isTruncated ? prettyJson(response.bodyText) : null),
    [isJson, response],
  );
  const showPretty = tab.responseView === 'pretty' && pretty !== null;
  const text = showPretty ? pretty : response.bodyText;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  const save = async () => {
    const res = await window.api.saveResponse(tab.id);
    if (res.saved) setNotice('Saved');
    else if (res.error) setNotice(res.error);
  };

  const cls = statusClass(response.status);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="response-view">
      <div
        className="flex h-9 shrink-0 items-center gap-4 border-b border-border px-3 text-[12.5px]"
        data-testid="response-meta"
      >
        <span className={`font-semibold ${STATUS_COLORS[cls]}`} data-testid="response-status">
          {response.status} {response.statusText}
        </span>
        <span className="text-fg-muted" title="Total time">
          {formatDuration(response.durationMs)}
        </span>
        <span
          className="text-fg-muted"
          title={`${response.wireSizeBytes} bytes over the wire, ${response.decodedSizeBytes} bytes decoded`}
        >
          {formatBytes(response.decodedSizeBytes)}
        </span>
        {response.redirectCount > 0 && (
          <span className="truncate text-fg-faint" title={response.finalUrl}>
            {response.redirectCount} redirect{response.redirectCount > 1 ? 's' : ''}
          </span>
        )}
        {notice && <span className="ml-auto text-fg-muted">{notice}</span>}
      </div>
      <SectionTabs<ResponseSection>
        label="Response sections"
        active={tab.responseSection}
        onChange={(s) => setUi(tab.id, { responseSection: s })}
        tabs={[
          { id: 'body', label: 'Body' },
          { id: 'headers', label: `Headers (${response.headers.length})` },
        ]}
      >
        {tab.responseSection === 'body' && !response.isBinary && (
          <>
            {pretty !== null && (
              <Segmented
                label="Body view"
                value={tab.responseView}
                onChange={(v) => setUi(tab.id, { responseView: v })}
                options={[
                  { id: 'pretty', label: 'Pretty' },
                  { id: 'raw', label: 'Raw' },
                ]}
              />
            )}
            <IconButton
              label="Search response"
              onClick={() => editors.response && openSearchPanel(editors.response)}
            >
              <SearchIcon />
            </IconButton>
            <IconButton
              label="Copy response"
              testId="copy-response"
              onClick={() => void window.api.copyText(text).then(() => setNotice('Copied'))}
            >
              <CopyIcon />
            </IconButton>
          </>
        )}
        <IconButton
          label="Save response to file"
          onClick={() => void save()}
          testId="save-response"
        >
          <SaveIcon />
        </IconButton>
      </SectionTabs>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab.responseSection === 'headers' ? (
          <HeadersList headers={response.headers} />
        ) : response.isBinary ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 text-fg-muted"
            data-testid="binary-response"
          >
            <p>
              Binary response, {response.decodedSizeBytes.toLocaleString()} bytes
              {response.undecodedEncoding
                ? ` (unsupported encoding: ${response.undecodedEncoding})`
                : ''}
            </p>
            <button
              onClick={() => void save()}
              className="rounded bg-accent px-3 py-1 text-accent-fg hover:opacity-90"
            >
              Save to file…
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {response.isTruncated && (
              <div
                className="shrink-0 border-b border-border bg-bg-subtle px-3 py-1.5 text-[12px] text-warning"
                data-testid="truncated-notice"
              >
                Showing the first {formatBytes(response.bodyText.length)} of{' '}
                {formatBytes(response.decodedSizeBytes)}. Save to file for the full body.
              </div>
            )}
            {response.bodyText === '' ? (
              <p className="px-4 py-6 text-center text-fg-faint">Empty body.</p>
            ) : (
              <CodeEditor
                className="min-h-0 flex-1 overflow-hidden"
                value={text}
                readOnly
                language={
                  showPretty || (isJson && response.bodyText.length < 1_000_000) ? 'json' : 'text'
                }
                onView={(v) => (editors.response = v)}
                testId="response-body"
                ariaLabel="Response body"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HeadersList({ headers }: { headers: [string, string][] }) {
  return (
    <div className="h-full overflow-auto p-2" data-testid="response-headers">
      <table className="w-full border-collapse font-mono text-[12.5px] select-text">
        <tbody>
          {headers.map(([k, v], i) => (
            <tr key={i} className="border-b border-border/60 align-top">
              <td className="w-1/3 py-1 pr-4 pl-2 font-medium break-all text-fg">{k}</td>
              <td className="py-1 pr-2 break-all text-fg-muted">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
