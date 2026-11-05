import { AppLayout } from './components/layout/AppLayout';
import { Sidebar } from './components/sidebar/Sidebar';
import { useMenuActions } from './lib/shortcuts';
import { useTabs } from './stores/tabs';

export default function App() {
  const closeTab = (id: string) => useTabs.getState().closeTab(id);
  useMenuActions({ save: () => {}, closeTab });
  return <AppLayout sidebar={<Sidebar />} onCloseTab={closeTab} />;
}
