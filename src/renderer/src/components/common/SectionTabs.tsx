import type { ReactNode } from 'react';

export interface SectionTab<T extends string> {
  id: T;
  label: ReactNode;
}

/** A row of text tabs, used for Params | Headers | Body … and Body | Headers. */
export function SectionTabs<T extends string>(props: {
  tabs: SectionTab<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
      <div role="tablist" aria-label={props.label} className="flex items-center gap-1">
        {props.tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === props.active}
            onClick={() => props.onChange(t.id)}
            className={`rounded px-2 py-1 text-[12.5px] ${
              t.id === props.active
                ? 'bg-bg-muted font-medium text-fg'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">{props.children}</div>
    </div>
  );
}

export function Segmented<T extends string>(props: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex rounded-md bg-bg-muted p-0.5">
      {props.options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={o.id === props.value}
          onClick={() => props.onChange(o.id)}
          className={`rounded px-2 py-0.5 text-[12px] ${
            o.id === props.value ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
