import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { baseExtensions, jsonLanguage, knownVariables, variableHighlighter } from './codemirror';

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: 'json' | 'text';
  multiline?: boolean;
  lineWrapping?: boolean;
  placeholder?: string;
  /** Known variable names. When set, `{{vars}}` are highlighted and unknown ones marked. */
  variables?: Set<string> | null;
  /** Called on Enter in single-line mode. */
  onEnter?: () => void;
  /** Extra DOM handlers, e.g. paste. Return true to stop CodeMirror's default. */
  onPaste?: (text: string, view: EditorView) => boolean;
  onView?: (view: EditorView | null) => void;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

const external = Annotation.define<boolean>();

/** A thin React wrapper around a CodeMirror 6 view. */
export function CodeEditor(props: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const language = useRef(new Compartment());
  const vars = useRef(new Compartment());

  const { multiline = true, readOnly = false, lineWrapping = false, placeholder } = props;

  useEffect(() => {
    const extensions: Extension[] = [
      baseExtensions({ multiline, readOnly, lineWrapping, placeholder }),
      language.current.of(latest.current.language === 'json' ? jsonLanguage : []),
      vars.current.of(
        latest.current.variables !== undefined
          ? [knownVariables.of(latest.current.variables), variableHighlighter]
          : [],
      ),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) {
          latest.current.onChange?.(u.state.doc.toString());
        }
      }),
      EditorView.domEventHandlers({
        paste(event, v) {
          const text = event.clipboardData?.getData('text/plain');
          if (text && latest.current.onPaste?.(text, v)) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      }),
    ];
    if (!multiline) {
      extensions.unshift(
        keymap.of([
          {
            key: 'Enter',
            run: () => {
              latest.current.onEnter?.();
              return true;
            },
          },
        ]),
      );
    }
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({ doc: latest.current.value, extensions }),
    });
    if (latest.current.ariaLabel) v.contentDOM.setAttribute('aria-label', latest.current.ariaLabel);
    view.current = v;
    latest.current.onView?.(v);
    return () => {
      latest.current.onView?.(null);
      v.destroy();
      view.current = null;
    };
  }, [multiline, readOnly, lineWrapping, placeholder]);

  // Push external value changes into the editor without echoing them back.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== props.value) {
      v.dispatch({
        changes: { from: 0, to: current.length, insert: props.value },
        annotations: external.of(true),
      });
    }
  }, [props.value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: language.current.reconfigure(props.language === 'json' ? jsonLanguage : []),
    });
  }, [props.language]);

  useEffect(() => {
    view.current?.dispatch({
      effects: vars.current.reconfigure(
        props.variables !== undefined
          ? [knownVariables.of(props.variables), variableHighlighter]
          : [],
      ),
    });
  }, [props.variables]);

  return <div ref={host} className={props.className} data-testid={props.testId} />;
}
