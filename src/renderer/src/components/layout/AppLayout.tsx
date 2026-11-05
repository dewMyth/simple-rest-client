import { useRef, type ReactNode } from 'react';
import { useActiveTab } from '../../stores/tabs';
import { useSettings } from '../../stores/settings';
import { Splitter } from '../common/Splitter';
import { RequestPane } from '../request/RequestPane';
import { UrlBar } from '../request/UrlBar';
import { ResponsePane } from '../response/ResponsePane';
import { TabBar } from './TabBar';

export function AppLayout(props: {
  sidebar: ReactNode;
  tabBarRight?: ReactNode;
  onCloseTab: (id: string) => void;
  onPasteUrl?: (text: string) => boolean;
  onLayoutChanged?: () => void;
}) {
  const tab = useActiveTab();
  const sidebarWidth = useSettings((s) => s.sidebarWidth);
  const requestFraction = useSettings((s) => s.requestFraction);
  const { setSidebarWidth, setRequestFraction } = useSettings.getState();
  const main = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full" data-testid="app-root">
      <aside style={{ width: sidebarWidth }} className="shrink-0 overflow-hidden">
        {props.sidebar}
      </aside>
      <Splitter
        direction="vertical"
        label="Resize sidebar"
        onDrag={(x) => setSidebarWidth(x)}
        onDragEnd={props.onLayoutChanged}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar onClose={props.onCloseTab} right={props.tabBarRight} />
        <UrlBar tab={tab} onPasteUrl={props.onPasteUrl} />
        <div ref={main} className="flex min-h-0 flex-1 flex-col">
          <div
            style={{ height: `${requestFraction * 100}%` }}
            className="min-h-0 shrink-0 overflow-hidden"
          >
            <RequestPane tab={tab} />
          </div>
          <Splitter
            direction="horizontal"
            label="Resize request and response"
            onDrag={(y) => {
              const rect = main.current?.getBoundingClientRect();
              if (rect && rect.height > 0) setRequestFraction((y - rect.top) / rect.height);
            }}
            onDragEnd={props.onLayoutChanged}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ResponsePane tab={tab} />
          </div>
        </div>
      </div>
    </div>
  );
}
