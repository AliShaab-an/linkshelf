import { useEffect, useRef, useState } from 'react';
import type { Project, Settings } from '@/domain/schemas';
import { getSettings, updateSettings } from '@/messaging/contracts';
import { Icon } from './ui/Icon';

type EditableSettings = Pick<
  Settings,
  | 'defaultProjectId'
  | 'includePinnedTabsByDefault'
  | 'confirmBeforeBulkClose'
  | 'notificationsEnabled'
  | 'defaultRestoreBehavior'
  | 'displayDensity'
  | 'defaultRestoreMode'
>;

export const SETTINGS_UPDATED_EVENT = 'linkshelf-settings-updated';

export function QuickSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<EditableSettings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || settings) return;
    void getSettings().then((response) => {
      if (!response.success) throw new Error(response.error.message);
      setSettings(response.settings);
      setProjects(response.projects);
    }).catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load settings.');
    });
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  async function savePatch(patch: Partial<EditableSettings>) {
    if (!settings || isSaving) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setIsSaving(true);
    setError(null);
    try {
      const response = await updateSettings(next);
      if (!response.success) throw new Error(response.error.message);
      setSettings(response.settings);
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, {
        detail: response.settings,
      }));
    } catch (caughtError) {
      setSettings(settings);
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  return <div ref={containerRef} className="relative">
    <button type="button" className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="Quick settings" aria-expanded={isOpen} onClick={() => setIsOpen((value) => !value)}><Icon name="settings" /></button>
    {isOpen && <div className="absolute right-0 top-12 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Quick settings</p><h2 className="font-bold">Side panel preferences</h2></div>{isSaving && <span className="text-xs text-slate-500">Saving...</span>}</div>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{error}</p>}
      {!settings && !error && <p className="mt-3 text-sm text-slate-500">Loading...</p>}
      {settings && <div className="mt-3 space-y-3">
        <Field label="Display density"><select className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" value={settings.displayDensity} disabled={isSaving} onChange={(event) => void savePatch({ displayDensity: event.target.value as Settings['displayDensity'] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field>
        <Field label="Default project"><select className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" value={settings.defaultProjectId} disabled={isSaving} onChange={(event) => void savePatch({ defaultProjectId: event.target.value })}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
        <Field label="Default project restore"><select className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" value={settings.defaultRestoreMode} disabled={isSaving} onChange={(event) => void savePatch({ defaultRestoreMode: event.target.value as Settings['defaultRestoreMode'] })}><option value="normal">Restore normally</option><option value="unloaded">Restore unloaded</option></select></Field>
        <label className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm font-medium"><span>Notifications</span><input type="checkbox" className="size-4 accent-blue-700" checked={settings.notificationsEnabled} disabled={isSaving} onChange={(event) => void savePatch({ notificationsEnabled: event.target.checked })} /></label>
      </div>}
    </div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}

