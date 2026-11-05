import type { KeyValue } from '@shared/types';
import { newId } from '../../lib/id';
import { XIcon } from './icons';
import { inputClass } from './kv';

/**
 * Editable key/value rows with per-row enable toggles. An empty row is always shown at the
 * bottom; typing into it adds a real row.
 */
export function KeyValueTable(props: {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  label: string;
}) {
  const { rows, onChange } = props;
  const update = (id: string, patch: Partial<KeyValue>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const addFrom = (patch: Partial<KeyValue>) =>
    onChange([...rows, { id: newId(), key: '', value: '', enabled: true, ...patch }]);

  return (
    <div role="table" aria-label={props.label} className="px-2 py-1">
      {rows.map((r) => (
        <div
          key={r.id}
          role="row"
          className="group flex items-center gap-1 border-b border-border/60 py-0.5"
        >
          <input
            type="checkbox"
            aria-label="Enabled"
            checked={r.enabled}
            onChange={(e) => update(r.id, { enabled: e.target.checked })}
            className="mx-1.5 accent-accent"
          />
          <input
            className={`${inputClass} ${r.enabled ? '' : 'text-fg-faint line-through'}`}
            value={r.key}
            placeholder={props.keyPlaceholder ?? 'Key'}
            aria-label="Key"
            onChange={(e) => update(r.id, { key: e.target.value })}
          />
          <input
            className={`${inputClass} ${r.enabled ? '' : 'text-fg-faint'}`}
            value={r.value}
            placeholder={props.valuePlaceholder ?? 'Value'}
            aria-label="Value"
            onChange={(e) => update(r.id, { value: e.target.value })}
          />
          <button
            aria-label="Remove row"
            onClick={() => remove(r.id)}
            className="rounded p-1 text-fg-faint opacity-0 hover:bg-bg-hover hover:text-fg group-hover:opacity-100 focus:opacity-100"
          >
            <XIcon />
          </button>
        </div>
      ))}
      <div role="row" className="flex items-center gap-1 py-0.5">
        <span className="mx-1.5 w-[13px]" />
        <input
          className={inputClass}
          value=""
          placeholder={props.keyPlaceholder ?? 'Key'}
          aria-label="New key"
          onChange={(e) => addFrom({ key: e.target.value })}
        />
        <input
          className={inputClass}
          value=""
          placeholder={props.valuePlaceholder ?? 'Value'}
          aria-label="New value"
          onChange={(e) => addFrom({ value: e.target.value })}
        />
        <span className="w-[22px]" />
      </div>
    </div>
  );
}
