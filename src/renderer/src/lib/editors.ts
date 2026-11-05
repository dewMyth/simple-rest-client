import type { EditorView } from '@codemirror/view';

/** Live editor views that shortcuts need to reach (focus URL, search response). */
export const editors: { url: EditorView | null; response: EditorView | null } = {
  url: null,
  response: null,
};
