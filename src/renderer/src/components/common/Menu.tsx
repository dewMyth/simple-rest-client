import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** A small popover menu anchored to its trigger button. */
export function Menu(props: {
  label: string;
  items: MenuItem[];
  trigger: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={props.testId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded p-0.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
      >
        {props.trigger}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[150px] rounded-md border border-border bg-bg py-1 shadow-lg"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = [
              ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
            ];
            const idx = items.indexOf(document.activeElement as HTMLElement);
            items[(idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          {props.items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-3 py-1 text-left text-[12.5px] hover:bg-bg-hover focus:bg-bg-hover focus:outline-none ${
                item.danger ? 'text-danger' : 'text-fg'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
