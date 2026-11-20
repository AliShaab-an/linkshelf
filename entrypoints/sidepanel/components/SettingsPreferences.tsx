import { useId, useState, type ReactNode } from 'react';
import type { DisplayDensity, RestoreMode, SettingsPatch } from '@/domain/schemas';
import { Dropdown } from './ui/Dropdown';
import { SegmentedControl } from './ui/SegmentedControl';
import { OperationWarnings } from './ui/OperationWarnings';
import type { useSettingsPreferences } from './useSettingsPreferences';

const densities = [
  ['comfortable', 'Comfortable', 'More space between saved links.'],
  ['compact', 'Compact', 'Fit more saved links on screen.'],
] as const;

const restoreModes: { value: RestoreMode; label: string }[] = [
  { value: 'normal', label: 'Load immediately' },
  { value: 'unloaded', label: 'Load when selected' },
];

const restoreBehaviors: { value: 'restore-and-remove' | 'open-copy'; label: string }[] = [
  { value: 'restore-and-remove', label: 'Remove from list' },
  { value: 'open-copy', label: 'Keep a copy' },
];

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

  const restoreMode = <div className="text-sm font-medium">
    <span id={`${prefix}-restore-mode-label`}>When restoring a whole project</span>
    {!compact && <span id={`${prefix}-restore-mode`} className="mt-0.5 block text-xs font-normal text-slate-600">Choose which option Restore all marks as the default.</span>}
    <SegmentedControl className="mt-1" value={settings.defaultRestoreMode} aria-disabled={locked} aria-labelledby={`${prefix}-restore-mode-label`}
      aria-describedby={compact ? undefined : `${prefix}-restore-mode`}
      options={restoreModes} onChange={mode => savePreference('restoring', { defaultRestoreMode: mode })} />
  </div>;

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
      <div className="text-sm font-medium">
        <span id={`${prefix}-default-project-label`}>Save new parked tabs to</span>
        <Dropdown className="mt-1 w-full" value={settings.defaultProjectId} aria-disabled={locked} aria-labelledby={`${prefix}-default-project-label`}
          options={projects.map(project => ({ value: project.id, label: project.name }))} onChange={projectId => savePreference('parking', { defaultProjectId: projectId })} />
      </div>
      {feedback('parking')}
    </PreferenceGroup>
    <PreferenceGroup title="Restoring tabs" compact={compact}>
      {!compact && <div className="mb-3 text-sm font-medium">
        <span id={`${prefix}-restore-behavior-label`}>After opening a parked link</span>
        <SegmentedControl className="mt-1" value={settings.defaultRestoreBehavior} aria-disabled={locked} aria-labelledby={`${prefix}-restore-behavior-label`}
          options={restoreBehaviors} onChange={behavior => savePreference('restoring', { defaultRestoreBehavior: behavior })} />
      </div>}
      {restoreMode}
      {feedback('restoring')}
    </PreferenceGroup>
    <PreferenceGroup title="Appearance" compact={compact}>
      {compact ? <div className="text-sm font-medium">
        <span id={`${prefix}-density-label`}>Saved link spacing</span>
        <SegmentedControl className="mt-1" value={settings.displayDensity} aria-disabled={locked} aria-labelledby={`${prefix}-density-label`}
          options={densities.map(([value, label]) => ({ value, label }))} onChange={(density: DisplayDensity) => savePreference('appearance', { displayDensity: density })} />
      </div> : <fieldset className="min-w-0">
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
    <h4 className="mb-2 font-semibold text-slate-900">{title}</h4>
    {children}
  </section>;
}
