import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, Facet, type Extension } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
  MatchDecorator,
  placeholder as placeholderExt,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export const theme = EditorView.theme({
  '&': { color: 'var(--fg)', backgroundColor: 'transparent', height: '100%', fontSize: '12.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--fg)', padding: '6px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--fg-faint)',
    border: 'none',
    paddingRight: '4px',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-match-active)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--selection-match)', outline: 'none' },
  '.cm-placeholder': { color: 'var(--fg-faint)' },
  '.cm-panels': { backgroundColor: 'var(--bg-subtle)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panel.cm-search': { padding: '6px 8px', fontFamily: 'var(--font-sans)', fontSize: '12px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': {
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
  },
  '.cm-textfield': {
    backgroundColor: 'var(--bg)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 6px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--bg-muted)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
  },
  '.cm-panel.cm-search label': { color: 'var(--fg-muted)' },
  '.cm-panel.cm-search [name=close]': { color: 'var(--fg-muted)' },
  '.cm-var-ok': { backgroundColor: 'var(--var-ok-bg)', color: 'var(--info)', borderRadius: '3px' },
  '.cm-var-bad': {
    backgroundColor: 'var(--var-bad-bg)',
    color: 'var(--danger)',
    borderRadius: '3px',
    textDecoration: 'underline wavy',
    textDecorationThickness: '1px',
  },
});

const highlight = HighlightStyle.define([
  { tag: t.propertyName, color: 'var(--syn-key)' },
  { tag: t.string, color: 'var(--syn-string)' },
  { tag: t.number, color: 'var(--syn-number)' },
  { tag: [t.bool, t.null], color: 'var(--syn-keyword)' },
  { tag: [t.brace, t.squareBracket, t.punctuation, t.separator], color: 'var(--fg-muted)' },
]);

export const jsonLanguage: Extension = [json(), syntaxHighlighting(highlight)];

/** Names that resolve in the active environment. `null` turns highlighting off. */
export const knownVariables = Facet.define<Set<string> | null, Set<string> | null>({
  combine: (values) => values[values.length - 1] ?? null,
});

const okMark = Decoration.mark({ class: 'cm-var-ok' });
const badMark = Decoration.mark({ class: 'cm-var-bad' });

function variableMatcher(view: EditorView): MatchDecorator {
  return new MatchDecorator({
    regexp: /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g,
    decoration: (m) => {
      const known = view.state.facet(knownVariables);
      return known && m[1] && known.has(m[1]) ? okMark : badMark;
    },
  });
}

export const variableHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    matcher: MatchDecorator;
    constructor(view: EditorView) {
      this.matcher = variableMatcher(view);
      this.decorations = this.matcher.createDeco(view);
    }
    update(u: ViewUpdate) {
      if (u.startState.facet(knownVariables) !== u.state.facet(knownVariables)) {
        this.decorations = this.matcher.createDeco(u.view);
      } else {
        this.decorations = this.matcher.updateDeco(u, this.decorations);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Keeps the document on one line: pasted or typed newlines become nothing. */
export const singleLine: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.newDoc.lines <= 1) return tr;
  const text = tr.newDoc.toString().replace(/\r?\n/g, '');
  return [tr, { changes: { from: 0, to: tr.newDoc.length, insert: text }, sequential: true }];
});

export interface BaseOptions {
  multiline: boolean;
  readOnly: boolean;
  lineWrapping: boolean;
  placeholder?: string;
}

export function baseExtensions(o: BaseOptions): Extension[] {
  const ext: Extension[] = [
    theme,
    drawSelection(),
    history(),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
      ...(o.multiline && !o.readOnly ? [indentWithTab] : []),
    ]),
    EditorState.readOnly.of(o.readOnly),
    EditorView.contentAttributes.of({
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    }),
  ];
  if (o.multiline) ext.push(lineNumbers(), bracketMatching());
  else ext.push(singleLine);
  if (o.lineWrapping) ext.push(EditorView.lineWrapping);
  if (o.placeholder) ext.push(placeholderExt(o.placeholder));
  return ext;
}
