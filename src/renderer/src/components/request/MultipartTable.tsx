import type { MultipartField } from '@shared/types';
import { newId } from '../../lib/id';
import { inputClass } from '../common/kv';
import { useFocusNewRow } from '../common/useFocusNewRow';
import { XIcon } from '../common/icons';

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function MultipartTable(props: {
  fields: MultipartField[];
  onChange: (f: MultipartField[]) => void;
}) {
  const { fields, onChange } = props;
  const update = (id: string, next: MultipartField) =>
    onChange(fields.map((f) => (f.id === id ? next : f)));
  const pick = async (f: MultipartField) => {
    const picked = await window.api.pickFile();
    if (picked)
      update(f.id, {
        id: f.id,
        kind: 'file',
        key: f.key || picked.name,
        filePath: picked.path,
        enabled: f.enabled,
      });
  };

  const { container, focusAfterAdd } = useFocusNewRow<HTMLDivElement>();

  return (
    <div ref={container} role="table" aria-label="Multipart fields" className="px-2 py-1">
      {fields.map((f) => (
        <div
          key={f.id}
          role="row"
          className="group flex items-center gap-1 border-b border-border/60 py-0.5"
        >
          <input
            type="checkbox"
            aria-label="Enabled"
            checked={f.enabled}
            onChange={(e) => update(f.id, { ...f, enabled: e.target.checked })}
            className="mx-1.5 accent-accent"
          />
          <input
            className={inputClass}
            value={f.key}
            placeholder="Key"
            aria-label="Key"
            data-row-id={f.id}
            data-field="key"
            onChange={(e) => update(f.id, { ...f, key: e.target.value })}
          />
          <select
            aria-label="Field type"
            value={f.kind}
            onChange={(e) =>
              update(
                f.id,
                e.target.value === 'file'
                  ? { id: f.id, kind: 'file', key: f.key, filePath: '', enabled: f.enabled }
                  : { id: f.id, kind: 'text', key: f.key, value: '', enabled: f.enabled },
              )
            }
            className="h-7 rounded border border-border bg-bg px-1 text-[12px]"
          >
            <option value="text">Text</option>
            <option value="file">File</option>
          </select>
          {f.kind === 'text' ? (
            <input
              className={inputClass}
              value={f.value}
              placeholder="Value"
              aria-label="Value"
              onChange={(e) => update(f.id, { ...f, value: e.target.value })}
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
              <button
                onClick={() => void pick(f)}
                className="h-6 shrink-0 rounded border border-border bg-bg-muted px-2 text-[12px] hover:bg-bg-hover"
              >
                Choose file…
              </button>
              <span className="truncate font-mono text-[12px] text-fg-muted" title={f.filePath}>
                {f.filePath ? fileName(f.filePath) : 'No file chosen'}
              </span>
            </div>
          )}
          <button
            aria-label="Remove field"
            onClick={() => onChange(fields.filter((x) => x.id !== f.id))}
            className="rounded p-1 text-fg-faint opacity-0 hover:bg-bg-hover hover:text-fg group-hover:opacity-100 focus:opacity-100"
          >
            <XIcon />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1 py-0.5">
        <span className="mx-1.5 w-[13px]" />
        <input
          className={inputClass}
          value=""
          placeholder="Key"
          aria-label="New key"
          onChange={(e) => {
            // Focus follows the new field so the next letter isn't typed into another new row.
            const id = newId();
            focusAfterAdd(id, 'key');
            onChange([
              ...fields,
              { id, kind: 'text', key: e.target.value, value: '', enabled: true },
            ]);
          }}
        />
        <button
          onClick={() =>
            onChange([
              ...fields,
              { id: newId(), kind: 'file', key: '', filePath: '', enabled: true },
            ])
          }
          className="h-7 shrink-0 rounded px-2 text-[12px] text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          + File field
        </button>
      </div>
    </div>
  );
}
