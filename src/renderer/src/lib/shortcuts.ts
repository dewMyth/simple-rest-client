import { openSearchPanel } from '@codemirror/search';
import { EditorSelection } from '@codemirror/state';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { MenuAction } from '@shared/ipc';
import { useTabs } from '../stores/tabs';
import { editors } from './editors';

export interface ShortcutHandlers {
  save: () => void;
  closeTab: (id: string) => void;
}

/** Wires native menu accelerators (section 9 of the plan) to app actions. */
export function useMenuActions(handlers: ShortcutHandlers): void {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    return window.api.onMenuAction((action: MenuAction) => {
      const tabs = useTabs.getState();
      switch (action) {
        case 'send': {
          const tab = tabs.tabs.find((t) => t.id === tabs.activeId);
          if (tab?.response.status === 'sending') tabs.cancel(tab.id);
          else void tabs.send(tabs.activeId);
          break;
        }
        case 'save':
          latest.current.save();
          break;
        case 'newTab':
          tabs.newTab();
          requestAnimationFrame(() => editors.url?.focus());
          break;
        case 'closeTab':
          latest.current.closeTab(tabs.activeId);
          break;
        case 'focusUrl': {
          const v = editors.url;
          if (v) {
            v.focus();
            v.dispatch({ selection: EditorSelection.range(0, v.state.doc.length) });
          }
          break;
        }
        case 'searchResponse': {
          const tab = tabs.tabs.find((t) => t.id === tabs.activeId);
          if (tab && tab.responseSection !== 'body')
            tabs.setUi(tab.id, { responseSection: 'body' });
          requestAnimationFrame(() => editors.response && openSearchPanel(editors.response));
          break;
        }
        case 'nextTab':
          tabs.cycle(1);
          break;
        case 'prevTab':
          tabs.cycle(-1);
          break;
      }
    });
  }, []);
}
