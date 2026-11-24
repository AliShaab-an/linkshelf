import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_SIDEBAR_PREFERENCES, normalizeSidebarPreferences,
  type HideableSidebarSection, type SidebarPreferences, type SidebarStart,
} from '@/domain/side-panel';
import { loadUiState, UI_STATE_STORAGE_KEY, updateUiState, UiStateSchema } from '../ui-state';
import { Dropdown } from './ui/Dropdown';

const tabs: { id: HideableSidebarSection; label: string }[] = [
  { id: 'park', label: 'Park' },
  { id: 'search', label: 'Search' },
  { id: 'today', label: 'Today' },
];

const startLabels: Record<SidebarStart, string> = {
  last: 'Where I left off', projects: 'Saved', park: 'Park', search: 'Search', today: 'Today',
};

const pick = (state: SidebarPreferences): SidebarPreferences => ({ startSection: state.startSection, hiddenSections: state.hiddenSections });

function same(current: SidebarPreferences | undefined, next: SidebarPreferences) {
  return current?.startSection === next.startSection && current.hiddenSections.join() === next.hiddenSections.join();
}

/** Reads the sidebar preferences and follows changes made anywhere, such as in another window. */
export function useSidebarPreferences() {
  const [preferences, setPreferences] = useState<SidebarPreferences>();
  const latest = useRef<SidebarPreferences>(undefined);
  const [error, setError] = useState('');

  const adopt = useCallback((next: SidebarPreferences) => {
    if (same(latest.current, next)) return;
    latest.current = next;
    setPreferences(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    void loadUiState().then(state => { if (!disposed) adopt(pick(state)); })
      .catch(() => { if (!disposed) adopt(DEFAULT_SIDEBAR_PREFERENCES); });
    const follow = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[UI_STATE_STORAGE_KEY]) return;
      const parsed = UiStateSchema.safeParse(changes[UI_STATE_STORAGE_KEY].newValue);
      if (parsed.success) adopt(pick(parsed.data));
    };
    browser.storage.onChanged.addListener(follow);
    return () => { disposed = true; browser.storage.onChanged.removeListener(follow); };
  }, [adopt]);

  const change = useCallback((patch: Partial<SidebarPreferences>) => {
    if (!latest.current) return;
    const next = normalizeSidebarPreferences({ ...latest.current, ...patch });
    adopt(next);
    setError('');
    void updateUiState(next).catch(() => setError('LinkShelf could not save this. Reopen Settings to see what is saved.'));
  }, [adopt]);

  return { preferences, error, change };
}

export function SidebarSetting() {
  const { preferences, error, change } = useSidebarPreferences();
  const prefix = useId();
  if (!preferences) return null;
  const hidden = preferences.hiddenSections;
  const startOptions = (['last', 'projects', 'park', 'search', 'today'] as const)
    .filter(id => !(hidden as string[]).includes(id))
    .map(id => ({ value: id, label: startLabels[id] }));

  return <section aria-labelledby={`${prefix}-title`} className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 id={`${prefix}-title`} className="font-semibold text-slate-900">Sidebar</h4>
    <div className="mt-2 text-sm font-medium">
      <span id={`${prefix}-start`}>Open the sidebar on</span>
      <Dropdown className="mt-1 w-full" value={preferences.startSection} options={startOptions} aria-labelledby={`${prefix}-start`}
        onChange={startSection => change({ startSection })} />
    </div>
    <fieldset className="mt-3 min-w-0" aria-describedby={`${prefix}-help`}>
      <legend className="text-sm font-medium">Tabs to show</legend>
      <p id={`${prefix}-help`} className="mt-0.5 text-xs text-slate-600">Hidden tabs still open from keyboard shortcuts. Saved is always shown.</p>
      <div className="mt-1 space-y-1">
        <label className="flex min-h-11 items-center gap-3 text-sm opacity-70">
          <input type="checkbox" checked disabled readOnly className="size-5" /> Saved
        </label>
        {tabs.map(tab => <label key={tab.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={!(hidden as string[]).includes(tab.id)}
            onChange={event => change({ hiddenSections: event.target.checked ? hidden.filter(id => id !== tab.id) : [...hidden, tab.id] })} />
          {tab.label}
        </label>)}
      </div>
    </fieldset>
    {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
  </section>;
}
