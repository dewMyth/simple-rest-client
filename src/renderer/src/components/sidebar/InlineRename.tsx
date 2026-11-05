import { useEffect, useRef, useState } from 'react';

/** Text field that commits on Enter or blur and cancels on Escape. */
export function InlineRename(props: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.value);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const v = value.trim();
    if (v && v !== props.value) props.onCommit(v);
    else props.onCancel();
  };
  return (
    <input
      ref={input}
      value={value}
      aria-label="Name"
      data-testid="inline-rename"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          done.current = true;
          props.onCancel();
        }
      }}
      className="h-6 min-w-0 flex-1 rounded border border-accent bg-bg px-1.5 text-[12.5px] focus:outline-none"
    />
  );
}
