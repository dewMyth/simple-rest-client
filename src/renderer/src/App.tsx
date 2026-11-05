import { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { Dialogs, Warnings } from './components/layout/Dialogs';
import { Sidebar } from './components/sidebar/Sidebar';
import { initPersistence, saveLayout } from './lib/persistence';
import { requestCloseTab, saveTab } from './lib/saving';
import { useMenuActions } from './lib/shortcuts';
import { useTabs } from './stores/tabs';
import { useUi } from './stores/ui';

let started = false;

export default function App() {
  const ready = useUi((s) => s.ready);
  useEffect(() => {
    if (started) return;
    started = true;
    initPersistence().catch((err: unknown) => {
      useUi.getState().addWarnings([`Couldn't load your data: ${(err as Error).message}`]);
      useUi.getState().setReady();
    });
  }, []);

  useMenuActions({
    save: () => saveTab(useTabs.getState().activeId),
    closeTab: requestCloseTab,
  });

  if (!ready) return <div className="h-full bg-bg" />;
  return (
    <>
      <AppLayout sidebar={<Sidebar />} onCloseTab={requestCloseTab} onLayoutChanged={saveLayout} />
      <Dialogs />
      <Warnings />
    </>
  );
}
