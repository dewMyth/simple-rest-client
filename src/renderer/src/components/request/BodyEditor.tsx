import type { BodyType, KeyValue, MultipartField, RequestBody } from '@shared/types';
import { prettyJson } from '../../lib/format';
import { useTabs, type Tab } from '../../stores/tabs';
import { useKnownVariables } from '../../stores/variables';
import { CodeEditor } from '../common/CodeEditor';
import { KeyValueTable } from '../common/KeyValueTable';
import { MultipartTable } from './MultipartTable';

const TYPES: { id: BodyType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'form', label: 'Form URL-encoded' },
  { id: 'multipart', label: 'Multipart' },
];

/** Switches body type while carrying over whatever content still makes sense. */
function convert(body: RequestBody, to: BodyType): RequestBody {
  const text = body.type === 'json' || body.type === 'text' ? body.content : '';
  const kv: KeyValue[] =
    body.type === 'form'
      ? body.fields
      : body.type === 'multipart'
        ? body.fields.flatMap((f) =>
            f.kind === 'text' ? [{ id: f.id, key: f.key, value: f.value, enabled: f.enabled }] : [],
          )
        : [];
  switch (to) {
    case 'none':
      return { type: 'none' };
    case 'json':
    case 'text':
      return { type: to, content: text };
    case 'form':
      return { type: 'form', fields: kv };
    case 'multipart':
      return {
        type: 'multipart',
        fields:
          body.type === 'multipart'
            ? body.fields
            : kv.map((f): MultipartField => ({ ...f, kind: 'text' })),
      };
  }
}

export function BodyEditor({ tab }: { tab: Tab }) {
  const { updateRequest } = useTabs.getState();
  const known = useKnownVariables();
  const body = tab.request.body;
  const set = (b: RequestBody) => updateRequest(tab.id, { body: b });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 items-center gap-3 px-3 py-2"
        role="radiogroup"
        aria-label="Body type"
      >
        {TYPES.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-fg-muted"
          >
            <input
              type="radio"
              name={`body-${tab.id}`}
              checked={body.type === t.id}
              onChange={() => set(convert(body, t.id))}
              className="accent-accent"
            />
            <span className={body.type === t.id ? 'text-fg' : ''}>{t.label}</span>
          </label>
        ))}
        {body.type === 'json' && (
          <button
            className="ml-auto rounded px-2 py-0.5 text-[12px] text-fg-muted hover:bg-bg-hover hover:text-fg"
            onClick={() => {
              const pretty = prettyJson(body.content);
              if (pretty !== null) set({ type: 'json', content: pretty });
            }}
          >
            Format
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {body.type === 'none' && (
          <p className="px-4 py-6 text-center text-fg-faint">This request has no body.</p>
        )}
        {(body.type === 'json' || body.type === 'text') && (
          <CodeEditor
            key={`${tab.id}-${body.type}`}
            className="h-full"
            value={body.content}
            language={body.type === 'json' ? 'json' : 'text'}
            lineWrapping
            variables={known}
            onChange={(content) => set({ type: body.type, content })}
            placeholder={body.type === 'json' ? '{\n  "key": "value"\n}' : 'Request body'}
            testId="body-editor"
            ariaLabel="Request body"
          />
        )}
        {body.type === 'form' && (
          <KeyValueTable
            label="Form fields"
            rows={body.fields}
            onChange={(fields) => set({ type: 'form', fields })}
          />
        )}
        {body.type === 'multipart' && (
          <MultipartTable
            fields={body.fields}
            onChange={(fields) => set({ type: 'multipart', fields })}
          />
        )}
      </div>
    </div>
  );
}
