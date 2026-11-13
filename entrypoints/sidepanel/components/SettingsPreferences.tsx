import { useId, useState, type ReactNode } from 'react';
import type { DisplayDensity, RestoreMode, SettingsPatch } from '@/domain/schemas';
import { Select } from './ui/Select';
import { OperationWarnings } from './ui/OperationWarnings';
import type { useSettingsPreferences } from './useSettingsPreferences';

const densities = [
  ['comfortable', 'Comfortable', 'More space between saved links.'],
  ['compact', 'Compact', 'Fit more saved links on screen.'],
] as const;

export function SettingsPreferences({ preferences, compact = false, disabled = false }: {
  preferences: ReturnType<typeof useSettingsPreferences>;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { settings, projects, save, loading, saving, message, error, warnings } = preferences;
  const prefix = useId();
  const locked = disabled || saving;
  const [activeGroup, setActiveGroup] = useState('');
  function savePreference(group: string, patch: SettingsPatch) {
    if (locked) return;
    setActiveGroup(group);
    void save(patch);
  }

  function feedback(group: string) {
    const active = activeGroup === group;
    return <>
      <div role="status" className="text-xs text-slate-600">
        {active && (saving || message) && <p className="mt-2">{saving ? 'Saving preference…' : message}</p>}
      </div>
      {active && error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {active && <OperationWarnings warnings={warnings} />}
    </>;
  }

  if (loading) return <p role="status" className="text-sm text-slate-600">Loading preferences…</p>;
  if (!settings) return <p role="alert" className="text-sm text-red-800">{error}</p>;

  const restoreMode = <label className="block text-sm font-medium">
    <span id={`${prefix}-restore-mode-label`}>When restoring a whole project</span>
    {!compact && <span id={`${prefix}-restore-mode`} className="mt-0.5 block text-xs font-normal text-slate-600">Choose which option Restore all marks as the default.</span>}
    <Select className="mt-1 w-full" value={settings.defaultRestoreMode} aria-disabled={locked} aria-labelledby={`${prefix}-restore-mode-label`}
      aria-describedby={compact ? undefined : `${prefix}-restore-mode`}
      onChange={event => savePreference('restoring', { defaultRestoreMode: event.target.value as RestoreMode })}>
      <option value="normal">Load tabs immediately</option>
      <option value="unloaded">Load tabs when selected</option>
    </Select>
  </label>;

  return <div className={compact ? 'space-y-2' : 'space-y-3'}>
    <PreferenceGroup title="Reminders" compact={compact}>
      <label className={`flex min-h-11 items-center justify-between gap-3 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="text-sm font-medium">
          <span id={`${prefix}-reminder-label`}>Desktop reminders</span>
          <span id={`${prefix}-reminder-help`} className="mt-0.5 block text-xs font-normal text-slate-600">Show a Chrome notification when a reminder is due. Due links still appear in Today when this is off.</span>
        </span>
        <span className="relative flex h-11 min-w-11 shrink-0 items-center">
          <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 h-full w-full opacity-0"
            aria-labelledby={`${prefix}-reminder-label`} aria-describedby={`${prefix}-reminder-help`}
            aria-disabled={locked} checked={settings.notificationsEnabled}
            onChange={event => savePreference('reminders', { notificationsEnabled: event.target.checked })} />
          <span aria-hidden="true" className="h-6 w-11 rounded-full bg-slate-500 peer-checked:bg-blue-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 peer-aria-disabled:opacity-50" />
          <span aria-hidden="true" className="pointer-events-none absolute start-1 size-4 rounded-full bg-white peer-checked:translate-x-5" />
        </span>
      </label>
      {feedback('reminders')}
    </PreferenceGroup>
    <PreferenceGroup title="Parking" compact={compact}>
      <label className="block text-sm font-medium">
        Save new parked tabs to
        <Select className="mt-1 w-full" value={settings.defaultProjectId} aria-disabled={locked}
          onChange={event => savePreference('parking', { defaultProjectId: event.target.value })}>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </Select>
      </label>
      {feedback('parking')}
    </PreferenceGroup>
    <PreferenceGroup title="Restoring tabs" compact={compact}>
      {!compact && <label className="mb-3 block text-sm font-medium">
        After opening a parked link
        <Select className="mt-1 w-full" value={settings.defaultRestoreBehavior} aria-disabled={locked}
          onChange={event => {
            savePreference('restoring', { defaultRestoreBehavior: event.target.value === 'open-copy' ? 'open-copy' : 'restore-and-remove' });
          }}>
          <option value="restore-and-remove">Remove from the parked list</option>
          <option value="open-copy">Keep a parked copy</option>
        </Select>
      </label>}
      {restoreMode}
      {feedback('restoring')}
    </PreferenceGroup>
    <PreferenceGroup title="Appearance" compact={compact}>
      {compact ? <label className="block text-sm font-medium">
        Saved link spacing
        <Select className="mt-1 w-full" value={settings.displayDensity} aria-disabled={locked}
          onChange={event => savePreference('appearance', { displayDensity: event.target.value as DisplayDensity })}>
          {densities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </label> : <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Saved link spacing</legend>
        <div className="grid grid-cols-2 gap-2">
          {densities.map(([value, label, description]) => <label key={value}
            className={`relative min-w-0 rounded-lg border p-2 text-sm has-checked:border-blue-500 has-checked:bg-blue-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-600 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <input type="radio" className="sr-only" name={`${prefix}-density`} value={value} checked={settings.displayDensity === value}
              aria-disabled={locked} aria-labelledby={`${prefix}-${value}-label`} aria-describedby={`${prefix}-${value}-help`}
              onChange={() => savePreference('appearance', { displayDensity: value })} />
            <span className={`mb-2 flex h-10 flex-col justify-center rounded bg-white px-2 ${value === 'comfortable' ? 'gap-2' : 'gap-1'}`} aria-hidden="true">
              <span className="h-1 w-4/5 rounded bg-slate-400" /><span className="h-1 w-3/5 rounded bg-slate-400" /><span className="h-1 w-4/5 rounded bg-slate-400" />
            </span>
            <span id={`${prefix}-${value}-label`} className="font-semibold">{label}</span>
            <span id={`${prefix}-${value}-help`} className="mt-0.5 block text-xs text-slate-600">{description}</span>
          </label>)}
        </div>
      </fieldset>}
      {feedback('appearance')}
    </PreferenceGroup>
  </div>;
}

function PreferenceGroup({ title, compact, children }: { title: string; compact: boolean; children: ReactNode }) {
  if (compact) return <div className="border-t border-slate-200 pt-2">{children}</div>;
  return <section className="rounded-xl border border-slate-200 bg-white p-3">
    <h3 className="mb-2 font-semibold">{title}</h3>
    {children}
  </section>;
}
