import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { SettingsSchema, type Project, type Settings, type SettingsPatch } from '@/domain/schemas';
import { getSettings, patchSettings } from '@/messaging/contracts';

export function useSettingsPreferences(enabled = true) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const pending = useRef(false);
  const storageVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = storageVersion.current;
    const response = await getSettings();
    if (!response.success) throw new Error(response.error.message);
    if (storageVersion.current === version) setSettings(response.settings);
    setProjects(response.projects);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setMessage(undefined);
    setError(undefined);
    setWarnings([]);
    void reload()
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load settings.'))
      .finally(() => setLoading(false));

    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !changes.linkshelfDatabase) return;
      const snapshot = changes.linkshelfDatabase.newValue as { settings?: unknown } | undefined;
      const next = SettingsSchema.safeParse(snapshot?.settings);
      if (next.success) {
        storageVersion.current++;
        setSettings(next.data);
      }
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => browser.storage.onChanged.removeListener(onStorageChanged);
  }, [enabled, reload]);

  async function save(patch: SettingsPatch) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setMessage(undefined);
    setError(undefined);
    setWarnings([]);
    try {
      const version = storageVersion.current;
      const response = await patchSettings(patch);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      if (storageVersion.current === version) setSettings(response.settings);
      setMessage('Preference saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this preference.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return { settings, projects, loading, saving, message, error, warnings, save, reload };
}
