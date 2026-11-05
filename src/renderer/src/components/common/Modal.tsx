import { useEffect, useRef, type ReactNode } from 'react';

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  testId?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  useEffect(() => {
    onClose.current = props.onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(
      'input, select, button[data-autofocus], button',
    );
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = [
          ...panel.current.querySelectorAll<HTMLElement>('input, select, button, textarea'),
        ].filter((el) => !el.hasAttribute('disabled'));
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey
          ? idx <= 0
            ? items.length - 1
            : idx - 1
          : idx === items.length - 1
            ? 0
            : idx + 1;
        e.preventDefault();
        items[next]!.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        data-testid={props.testId}
        className="w-[420px] max-w-[90vw] rounded-lg border border-border bg-bg shadow-xl"
      >
        <h2 className="px-4 pt-4 pb-2 text-[14px] font-semibold">{props.title}</h2>
        <div className="px-4 pb-4">{props.children}</div>
        <div className="flex justify-end gap-2 rounded-b-lg border-t border-border bg-bg-subtle px-4 py-3">
          {props.footer}
        </div>
      </div>
    </div>
  );
}

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'default';
  type?: 'button' | 'submit';
  disabled?: boolean;
  testId?: string;
}) {
  const v = props.variant ?? 'default';
  const cls =
    v === 'primary'
      ? 'bg-accent text-accent-fg hover:opacity-90'
      : v === 'danger'
        ? 'bg-danger text-white hover:opacity-90'
        : 'border border-border bg-bg hover:bg-bg-hover';
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props.testId}
      className={`h-7 rounded-md px-3 text-[12.5px] font-medium disabled:opacity-50 ${cls}`}
    >
      {props.children}
    </button>
  );
}
