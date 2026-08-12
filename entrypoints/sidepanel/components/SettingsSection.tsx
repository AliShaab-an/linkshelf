import { useEffect, useState } from 'react';
import {
  LinkShelfBackupSchema,
  type LinkShelfBackup,
  type Project,
  type Settings,
} from '@/domain/schemas';
import { exportData, getSettings, importData, updateSettings } from '@/messaging/contracts';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

type EditableSettings = Pick<Settings, 'defaultProjectId' | 'includePinnedTabsByDefault' | 'confirmBeforeBulkClose' | 'notificationsEnabled' | 'defaultRestoreBehavior'>;

export function SettingsSection() {
  const [settings, setSettings] = useState<EditableSettings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importBackup, setImportBackup] = useState<LinkShelfBackup | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [pendingImportMode, setPendingImportMode] = useState<'merge' | 'replace' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [parkShortcut, setParkShortcut] = useState('Alt+Shift+P');

  useEffect(() => {
    void getSettings()
      .then((response) => {
        if (!response.success) throw new Error(response.error.message);
        setSettings(response.settings);
        setProjects(response.projects);
      })
      .catch((caughtError) => setError(toMessage(caughtError, 'LinkShelf could not load settings.')))
      .finally(() => setIsLoading(false));

    void browser.commands.getAll().then((commands) => {
      const command = commands.find((candidate) => candidate.name === 'park-current-tab');
      setParkShortcut(command?.shortcut || 'Not assigned');
    });
  }, []);

  function patch<K extends keyof EditableSettings>(key: K, value: EditableSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
    setMessage(null);
  }

  async function save() {
    if (!settings) return;
    setIsSaving(true); setError(null); setMessage(null);
    try {
      const response = await updateSettings(settings);
      if (!response.success) throw new Error(response.error.message);
      setSettings(response.settings);
      setMessage('Settings saved.');
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not save settings.'));
    } finally { setIsSaving(false); }
  }

  async function downloadBackup() {
    setIsExporting(true); setError(null); setMessage(null);
    try {
      const response = await exportData();
      if (!response.success) throw new Error(response.error.message);
      const blob = new Blob([JSON.stringify(response.backup, null, 2)], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `linkshelf-backup-${response.backup.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      setMessage('Backup downloaded. Store it somewhere private because it contains your URLs and notes.');
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not export your data.'));
    } finally { setIsExporting(false); }
  }

  async function selectBackup(file: File | undefined) {
    setImportBackup(null); setPendingImportMode(null); setError(null); setMessage(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError('This backup is larger than the 5 MB import limit.');
      return;
    }

    try {
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const parsedBackup = LinkShelfBackupSchema.safeParse(parsedJson);
      if (!parsedBackup.success) {
        throw new Error('This file is not a valid LinkShelf backup or uses an unsupported schema version.');
      }
      setImportBackup(parsedBackup.data);
      setImportFileName(file.name);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not read this backup file.'));
    }
  }

  async function confirmImport() {
    if (!importBackup || !pendingImportMode) return;
    const mode = pendingImportMode;
    setIsImporting(true); setError(null); setMessage(null);
    try {
      const response = await importData(importBackup, mode);
      if (!response.success) throw new Error(response.error.message);
      const refreshed = await getSettings();
      if (refreshed.success) {
        setSettings(refreshed.settings);
        setProjects(refreshed.projects);
      }
      setImportBackup(null); setPendingImportMode(null); setImportFileName('');
      setMessage(
        mode === 'replace'
          ? `Backup restored: ${response.result.linksAdded} links loaded.`
          : `Backup merged: ${response.result.projectsAdded} projects, ${response.result.sessionsAdded} sessions, and ${response.result.linksAdded} links added.`,
      );
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not import this backup. Your existing data was kept.'));
    } finally { setIsImporting(false); }
  }

  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Local preferences</p>
        <h2 className="mt-1 text-lg font-bold">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">LinkShelf stores its own data locally and does not send your links, notes, or bookmarks to a server.</p>
      </div>
      {message && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {isLoading && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">Loading settings...</p>}
      {settings && <div className="space-y-4">
        <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-700 to-blue-800 p-4 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Keyboard shortcut</p>
          <div className="mt-2 flex items-center justify-between gap-3"><div><h3 className="font-bold">Park current tab</h3><p className="mt-1 text-sm text-blue-100">Uses your default project and closes only after saving.</p></div><kbd className="shrink-0 rounded-lg border border-white/25 bg-white/15 px-2.5 py-1.5 text-xs font-bold shadow-inner">{parkShortcut}</kbd></div>
          <button type="button" className="mt-4 w-full rounded-xl bg-white/15 px-3 py-2 text-sm font-bold text-white hover:bg-white/25" onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts', active: true })}>Change keyboard shortcut</button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Parking and restoration</h3>
          <label className="mt-4 block text-sm font-medium" htmlFor="default-project">Default project</label>
          <select id="default-project" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={settings.defaultProjectId} onChange={(event) => patch('defaultProjectId', event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <Toggle label="Chrome notifications" description="Due reminders still appear in Today when notifications are off." checked={settings.notificationsEnabled} onChange={(value) => patch('notificationsEnabled', value)} />
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Bulk parking always requires confirmation, and pinned tabs stay excluded by default while the related advanced preferences are being completed.</p>
          <button type="button" className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={isSaving} onClick={() => void save()}>{isSaving ? 'Saving...' : 'Save settings'}</button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Backup and privacy</h3>
          <p className="mt-2 text-sm text-slate-600">Export projects, sessions, links, reminders, and settings as readable JSON. Chrome bookmarks are not included.</p>
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Backups can contain sensitive URLs and notes. Store the file securely.</p>
          <button type="button" className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50" disabled={isExporting} onClick={() => void downloadBackup()}>{isExporting ? 'Preparing backup...' : 'Export LinkShelf data'}</button>

          <div className="my-4 border-t border-slate-200" />
          <h4 className="text-sm font-semibold">Restore a backup</h4>
          <p className="mt-1 text-xs text-slate-500">Only validated LinkShelf JSON files up to 5 MB are accepted.</p>
          <label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Choose backup file
            <input type="file" className="sr-only" accept="application/json,.json" onChange={(event) => void selectBackup(event.target.files?.[0])} />
          </label>

          {importBackup && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">{importFileName}</p>
            <p className="mt-1 text-xs">Exported {new Date(importBackup.exportedAt).toLocaleString()}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Projects</dt><dd className="font-bold">{importBackup.database.projects.length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Sessions</dt><dd className="font-bold">{importBackup.database.sessions.length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Links</dt><dd className="font-bold">{importBackup.database.links.length}</dd></div></dl>
            <div className="mt-3 flex gap-2"><button type="button" className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => setPendingImportMode('merge')}>Merge</button><button type="button" className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700" onClick={() => setPendingImportMode('replace')}>Replace all</button></div>
          </div>}

          {importBackup && pendingImportMode && <div className={`mt-3 rounded-lg border p-3 ${pendingImportMode === 'replace' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`} role="alertdialog" aria-labelledby="confirm-import-title">
            <h4 id="confirm-import-title" className="font-semibold">Confirm {pendingImportMode} import</h4>
            <p className="mt-1 text-sm text-slate-700">{pendingImportMode === 'replace' ? 'This replaces all current LinkShelf projects, sessions, links, reminders, and settings. A rollback snapshot is used if writing fails.' : 'Current records stay unchanged. New backup records are added, and matching record IDs are skipped.'}</p>
            <div className="mt-3 flex gap-2"><button type="button" className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${pendingImportMode === 'replace' ? 'bg-red-700' : 'bg-slate-900'}`} disabled={isImporting} onClick={() => void confirmImport()}>{isImporting ? 'Importing...' : `Confirm ${pendingImportMode}`}</button><button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={isImporting} onClick={() => setPendingImportMode(null)}>Cancel</button></div>
          </div>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-900">Why these permissions?</h3>
          <ul className="mt-2 space-y-2"><li><strong>Tabs:</strong> save, close, and restore tabs you choose.</li><li><strong>Bookmarks:</strong> search and create native Chrome bookmarks.</li><li><strong>Alarms and notifications:</strong> deliver reminders.</li><li><strong>Storage:</strong> keep LinkShelf data on this device.</li></ul>
        </section>
      </div>}
    </>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="mt-4 flex cursor-pointer items-start justify-between gap-4 border-t border-slate-100 pt-4"><span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs text-slate-500">{description}</span></span><input type="checkbox" className="mt-1 h-4 w-4 accent-slate-900" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
