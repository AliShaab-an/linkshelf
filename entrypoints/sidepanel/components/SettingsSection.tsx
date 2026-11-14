import { InlineConfirmation } from './ui/InlineConfirmation';
import { OperationFeedback } from './ui/OperationFeedback';
import { SettingsPreferences } from './SettingsPreferences';
import { useSettingsPreferences } from './useSettingsPreferences';
import { withSecondaryWarning } from '@/features/operations/secondary-result';
import { useEffect, useRef, useState } from 'react';
import type { LinkShelfBackup } from '@/domain/schemas';
import { BACKUP_SIZE_LIMIT_LABEL } from '@/domain/constants';
import { readBackupFile, stringifyBackup } from '@/domain/backup';
import type { ImportBackupPreview, ImportMode } from '@/storage/repository';
import {
  exportData,
  importData,
  previewImportData,
} from '@/messaging/contracts';

export function SettingsSection() {
  const backupInput = useRef<HTMLInputElement>(null);
  const importTrigger = useRef<HTMLButtonElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const preferences = useSettingsPreferences();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [importBackup, setImportBackup] = useState<LinkShelfBackup | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportBackupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});

  useEffect(() => {
    void browser.commands.getAll().then((commands) => setShortcuts(
      Object.fromEntries(commands.map((command) => [command.name ?? '', command.shortcut || 'Not assigned'])),
    ));
  }, []);

  async function downloadBackup() {
    setWarnings([]);
    setIsExporting(true); setError(null); setMessage(null);
    try {
      const response = await exportData();
      if (!response.success) throw new Error(response.error.message);
      const blob = new Blob([stringifyBackup(response.backup)], { type: 'application/json' });
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
    setImportBackup(null); setImportPreview(null); setError(null); setMessage(null);
    if (!file) return;
    try {
      setImportBackup(await readBackupFile(file));
      setImportFileName(file.name);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not read this backup file.'));
    }
  }

  async function chooseImportMode(mode: ImportMode) {
    if (!importBackup || isPreviewing || isImporting) return;
    setWarnings([]);
    setIsPreviewing(true); setImportPreview(null); setError(null); setMessage(null);
    try {
      const response = await previewImportData(importBackup, mode);
      if (!response.success) throw new Error(response.error.message);
      setImportPreview(response.preview);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not prepare an import summary.'));
    } finally { setIsPreviewing(false); }
  }

  async function confirmImport() {
    if (!importBackup || !importPreview || isImporting || importPreview.conflicts > 0) return;
    const mode = importPreview.mode;
    setWarnings([]);
    setIsImporting(true); setError(null); setMessage(null);
    try {
      const response = await importData(importBackup, mode, importPreview.revisionToken);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      const completed = await withSecondaryWarning(response, preferences.reload, 'Your backup was imported, but this view could not refresh. Reopen Settings to load the imported preferences.');
      setWarnings(completed.warnings ?? []);
      setImportBackup(null); setImportPreview(null); setImportFileName('');
      setMessage(
        mode === 'replace'
          ? `Backup restored: ${response.result.linksAdded} links loaded.`
          : `Backup merged: ${response.result.projectsAdded} projects, ${response.result.sessionsAdded} sessions, and ${response.result.linksAdded} links added.`,
      );
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not complete this import. Review the error before trying again.'));
    } finally { setIsImporting(false); }
  }

  const feedback = <OperationFeedback pending={isImporting ? 'Importing backup…' : isPreviewing ? 'Checking backup…' : isExporting ? 'Preparing backup…' : undefined} message={message} error={error} warnings={warnings} />;

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-bold">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">LinkShelf stores its own data locally and does not send your links, notes, or bookmarks to a server.</p>
      </div>
      <SettingsPreferences preferences={preferences} disabled={isPreviewing || isImporting || importPreview !== null} />
      <div className="mt-4 space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Backup</h3>
          {feedback}
          <p className="mt-2 text-sm text-slate-600">Export projects, sessions, links, reminders, and settings as readable JSON. Chrome bookmarks are not included.</p>
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Backups can contain sensitive URLs and notes. Store the file securely.</p>
          <button type="button" className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50" disabled={isExporting} onClick={() => void downloadBackup()}>{isExporting ? 'Preparing backup...' : 'Download backup'}</button>

          <div className="my-4 border-t border-slate-200" />
          <h4 className="text-sm font-semibold">Import backup</h4>
          <p className="mt-1 text-xs text-slate-500">Validated LinkShelf JSON files up to {BACKUP_SIZE_LIMIT_LABEL} are accepted. Imports must also fit the available Chrome storage space.</p>
          <label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Choose backup file
            <input ref={backupInput} type="file" disabled={isPreviewing || isImporting || preferences.saving} className="sr-only" accept="application/json,.json" onChange={(event) => void selectBackup(event.target.files?.[0])} />
          </label>

          {importBackup && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">{importFileName}</p>
            <p className="mt-1 text-xs">Exported {new Date(importBackup.exportedAt).toLocaleString()}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Projects</dt><dd className="font-bold">{importBackup.database.projects.length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Sessions</dt><dd className="font-bold">{importBackup.database.sessions.length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Links</dt><dd className="font-bold">{importBackup.database.links.length}</dd></div></dl>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-center"><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Notes</dt><dd className="font-bold">{importBackup.database.sessions.filter((session) => !!session.note?.trim()).length + importBackup.database.links.filter((link) => !!link.note?.trim()).length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Reminders</dt><dd className="font-bold">{importBackup.database.links.filter((link) => link.reminderAt !== undefined).length}</dd></div></dl>
            <p className="mt-2 text-xs text-blue-800">{importBackup.database.links.filter((link) => link.status === 'parked').length} parked · {importBackup.database.links.filter((link) => link.status === 'archived').length} archived · {importBackup.database.links.filter((link) => link.status === 'restored' || link.status === 'removed').length} history</p>
            <p className="mt-3 text-xs">Merge adds missing records and keeps current settings. Replace all uses the backup as your library and applies its settings.</p>
            <div className="mt-3 flex gap-2"><button type="button" className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={isPreviewing || isImporting || preferences.saving} onClick={(event) => { importTrigger.current = event.currentTarget; void chooseImportMode('merge'); }}>{isPreviewing ? 'Checking...' : 'Merge'}</button><button type="button" className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50" disabled={isPreviewing || isImporting || preferences.saving} onClick={(event) => { importTrigger.current = event.currentTarget; void chooseImportMode('replace'); }}>Replace all</button></div>
          </div>}

          {importBackup && importPreview && <InlineConfirmation className={`mt-3 rounded-lg border p-3 ${importPreview.mode === 'replace' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`} titleId="confirm-import-title" title={<>Confirm {importPreview.mode} import</>}
            returnFocus={() => importTrigger.current?.isConnected ? importTrigger.current : backupInput.current}>
            <p className="mt-1 text-sm text-slate-700">{importPreview.mode === 'replace' ? `This will replace ${importPreview.current.projects} current projects, ${importPreview.current.sessions} sessions, and ${importPreview.current.links} links, including current settings.` : `This will add ${importPreview.projectsAdded} projects, ${importPreview.sessionsAdded} sessions, and ${importPreview.linksAdded} links. ${importPreview.recordsSkipped} matching records will be skipped and current settings will stay unchanged.`}</p>
            {importPreview.conflicts > 0 && <p className="mt-2 rounded bg-red-100 p-2 text-sm font-semibold text-red-800">{importPreview.conflicts} conflicting record relationship{importPreview.conflicts === 1 ? '' : 's'} must be resolved before this backup can be merged. Nothing will be changed.</p>}
            <div className="mt-3 flex gap-2"><button type="button" className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${importPreview.mode === 'replace' ? 'bg-red-700' : 'bg-slate-900'}`} disabled={isImporting || importPreview.conflicts > 0} onClick={() => void confirmImport()}>{isImporting ? 'Importing...' : importPreview.mode === 'replace' ? 'Replace LinkShelf data' : 'Confirm merge'}</button><button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={isImporting} onClick={() => setImportPreview(null)}>Cancel</button></div>
          </InlineConfirmation>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Keyboard shortcuts</h3>
          <div className="mt-3 space-y-2">{[
            ['park-current-tab', 'Park current tab'],
            ['toggle-side-panel', 'Open or close LinkShelf'],
            ['open-search', 'Open Search'],
            ['open-today', 'Open Today'],
          ].map(([name, label]) => <div key={name} className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{label}</span><kbd className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold shadow-inner">{shortcuts[name] ?? 'Loading...'}</kbd></div>)}</div>
          <button type="button" className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts', active: true })}>Manage keyboard shortcuts</button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-900">Why these permissions?</h3>
          <ul className="mt-2 space-y-2"><li><strong>Tabs:</strong> save, close, and restore tabs you choose.</li><li><strong>Bookmarks:</strong> search and create native Chrome bookmarks.</li><li><strong>Alarms and notifications:</strong> deliver reminders.</li><li><strong>Storage:</strong> keep LinkShelf data on this device.</li></ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-900">Help shape LinkShelf</h3>
          <p className="mt-2">Found a bug or have an idea? Early feedback directly guides the next release.</p>
          <div className="mt-3 flex gap-2"><a className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-center font-semibold text-white" href="mailto:ali.shaaban2002@gmail.com?subject=LinkShelf%20feedback">Send feedback</a><a className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center font-semibold text-slate-800" href="https://github.com/AliShaab-an/linkshelf/issues" target="_blank" rel="noreferrer">Report issue</a></div>
        </section>
      </div>
    </>
  );
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
