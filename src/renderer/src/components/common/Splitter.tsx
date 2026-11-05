import { useRef } from 'react';

/**
 * A drag handle. `onDrag` receives the pointer position (clientX for vertical handles,
 * clientY for horizontal ones). `onDragEnd` fires once when the drag finishes.
 */
export function Splitter(props: {
  direction: 'vertical' | 'horizontal';
  onDrag: (pos: number) => void;
  onDragEnd?: () => void;
  label: string;
}) {
  const dragging = useRef(false);
  const vertical = props.direction === 'vertical';
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={props.label}
      className={`relative shrink-0 bg-border ${vertical ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'}`}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        document.body.style.cursor = vertical ? 'col-resize' : 'row-resize';
      }}
      onPointerMove={(e) => {
        if (dragging.current) props.onDrag(vertical ? e.clientX : e.clientY);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        document.body.style.cursor = '';
        props.onDragEnd?.();
      }}
    >
      <div
        className={`absolute z-10 ${vertical ? '-left-1 -right-1 inset-y-0' : '-top-1 -bottom-1 inset-x-0'}`}
      />
    </div>
  );
}
