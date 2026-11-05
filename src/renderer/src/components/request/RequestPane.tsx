import { useTabs, type RequestSection, type Tab } from '../../stores/tabs';
import { KeyValueTable } from '../common/KeyValueTable';
import { countEnabled } from '../common/kv';
import { SectionTabs } from '../common/SectionTabs';
import { BodyEditor } from './BodyEditor';
import { OptionsEditor } from './OptionsEditor';
import { AuthEditor } from './AuthEditor';

const withCount = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);

export function RequestPane({ tab }: { tab: Tab }) {
  const { setUi, setParams, updateRequest } = useTabs.getState();
  const section = tab.requestSection;
  const r = tab.request;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTabs<RequestSection>
        label="Request sections"
        active={section}
        onChange={(s) => setUi(tab.id, { requestSection: s })}
        tabs={[
          { id: 'params', label: withCount('Params', countEnabled(tab.params)) },
          { id: 'headers', label: withCount('Headers', countEnabled(r.headers)) },
          { id: 'body', label: r.body.type === 'none' ? 'Body' : 'Body •' },
          { id: 'auth', label: r.auth.type === 'none' ? 'Auth' : 'Auth •' },
          { id: 'options', label: 'Options' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {section === 'params' && (
          <KeyValueTable
            label="Query parameters"
            rows={tab.params}
            onChange={(rows) => setParams(tab.id, rows)}
          />
        )}
        {section === 'headers' && (
          <KeyValueTable
            label="Headers"
            rows={r.headers}
            keyPlaceholder="Header"
            onChange={(headers) => updateRequest(tab.id, { headers })}
          />
        )}
        {section === 'body' && <BodyEditor tab={tab} />}
        {section === 'auth' && <AuthEditor tab={tab} />}
        {section === 'options' && <OptionsEditor tab={tab} />}
      </div>
    </div>
  );
}
