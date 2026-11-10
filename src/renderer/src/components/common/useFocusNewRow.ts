import { useLayoutEffect, useRef } from 'react';

export type RowField = 'key' | 'value';

/**
 * Moves focus into a row that was just created from the table's empty "new" row, so the user
 * keeps typing in the same field. Inputs opt in with `data-row-id` and `data-field`.
 */
export function useFocusNewRow<T extends HTMLElement>() {
  const container = useRef<T>(null);
  const pending = useRef<{ id: string; field: RowField } | null>(null);

  // Layout effect: runs after React commits the new row and before the next key event is handled.
  useLayoutEffect(() => {
    const target = pending.current;
    if (!target || !container.current) return;
    pending.current = null;
    const input = container.current.querySelector<HTMLInputElement>(
      `input[data-row-id="${CSS.escape(target.id)}"][data-field="${target.field}"]`,
    );
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });

  return {
    container,
    /** Call when a new row is created; focus moves to its `field` input after the render. */
    focusAfterAdd(id: string, field: RowField) {
      pending.current = { id, field };
    },
  };
}
