import { useEnvironments } from '../../stores/environments';
import { useUi } from '../../stores/ui';

const MANAGE = '__manage__';

export function EnvironmentSwitcher() {
  const environments = useEnvironments((s) => s.environments);
  const activeId = useEnvironments((s) => s.activeId);
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
      Env
      <select
        aria-label="Active environment"
        data-testid="env-switcher"
        value={activeId ?? ''}
        onChange={(e) => {
          if (e.target.value === MANAGE) {
            useUi.getState().openDialog({ kind: 'environments', selectedId: activeId });
            return;
          }
          useEnvironments.getState().setActive(e.target.value || null);
        }}
        className="h-6 max-w-[160px] rounded border border-border bg-bg px-1 text-[12px] text-fg"
      >
        <option value="">No environment</option>
        {environments.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
        <option value={MANAGE}>Manage environments…</option>
      </select>
    </label>
  );
}
