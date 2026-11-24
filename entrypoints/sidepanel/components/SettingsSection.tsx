import { InlineConfirmation } from './ui/InlineConfirmation';
import { buttonClass } from './ui/styles';
import { SectionHeader } from './ui/SectionHeader';
import { OperationFeedback } from './ui/OperationFeedback';
import { SettingsPreferences } from './SettingsPreferences';
import { SidebarSetting } from './SidebarSetting';
import { useSettingsPreferences } from './useSettingsPreferences';
import { withSecondaryWarning } from '@/features/operations/secondary-result';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { settingsPageFromHash, type SettingsPage } from '@/domain/manager';
import { TabGroupsSetting } from './TabGroupsSetting';
import { RATE_PROMPT_REVIEW_URL } from '@/domain/rate-prompt';
import type { LinkShelfBackup } from '@/domain/schemas';
import { buildExport, type ExportFormat } from '@/domain/export';
import { Dropdown } from './ui/Dropdown';
import { SnapshotsPanel } from './SnapshotsPanel';
import { AutoBackupsPanel } from './AutoBackupsPanel';
import { BACKUP_SIZE_LIMIT_LABEL } from '@/domain/constants';
import { stringifyBackup } from '@/domain/backup';
import { readImportFile, type ImportFile } from '@/domain/importers';
import type { ImportBackupPreview, ImportMode } from '@/storage/repository';
import {
  exportData,
  getSettings,
  importData,
  previewImportData,
} from '@/messaging/contracts';

const groups: readonly { page: SettingsPage; id: string; title: string; description: string }[] = [
  { page: 'general', id: 'settings-general', title: 'General', description: 'How LinkShelf parks, restores, reminds, and looks.' },
  { page: 'data', id: 'settings-data', title: 'Your data', description: 'Back up, import, and export your library. Everything stays on this device.' },
  { page: 'about', id: 'settings-about', title: 'About', description: 'Privacy, permissions, and how to get help.' },
];

export function SettingsSection() {
  const backupInput = useRef<HTMLInputElement>(null);
  const importTrigger = useRef<HTMLButtonElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const preferences = useSettingsPreferences();
  const [isExporting, setIsExporting] = useState(false);
  const [readableProject, setReadableProject] = useState('');
  const [readableFormat, setReadableFormat] = useState<ExportFormat>('markdown');
  const [readableProjects, setReadableProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [importBackup, setImportBackup] = useState<LinkShelfBackup | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importFile, setImportFile] = useState<ImportFile | null>(null);
  const [importPreview, setImportPreview] = useState<ImportBackupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [page, setPage] = useState<SettingsPage>(() => settingsPageFromHash(location.hash));
  const moved = useRef(false);

  // Each group is its own page, named in the address so links such as #settings/data open it directly.
  useEffect(() => {
    const follow = () => {
      moved.current = true;
      setPage(settingsPageFromHash(location.hash));
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  useLayoutEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    window.scrollTo(0, 0);
    document.getElementById(`${groups.find(group => group.page === page)?.id}-title`)?.focus({ preventScroll: true });
  }, [page]);

  useEffect(() => {
    let current = true;
    void getSettings().then((response) => {
      if (current && response.success) setReadableProjects(response.projects.map(({ id, name }) => ({ id, name })));
    }).catch(() => undefined);
    return () => { current = false; };
  }, []);

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

  async function downloadReadable() {
    setWarnings([]);
    setIsExporting(true); setError(null); setMessage(null);
    try {
      const response = await exportData();
      if (!response.success) throw new Error(response.error.message);
      const result = buildExport(response.backup.database, { projectId: readableProject || undefined, format: readableFormat, exportedAt: response.backup.exportedAt });
      const extension = readableFormat === 'html' ? 'html' : 'md';
      const blob = new Blob([result.content], { type: readableFormat === 'html' ? 'text/html' : 'text/markdown' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `linkshelf-export-${response.backup.exportedAt.slice(0, 10)}.${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      setMessage(`${result.truncated ? 'Partial export downloaded: some links were left out. ' : 'Export downloaded. '}${result.linkCount} ${result.linkCount === 1 ? 'link' : 'links'} in ${result.projectCount} ${result.projectCount === 1 ? 'project' : 'projects'}. This file cannot be imported back; use Download backup for a restorable copy.`);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not create this export.'));
    } finally { setIsExporting(false); }
  }

  async function selectBackup(file: File | undefined) {
    setImportBackup(null); setImportFile(null); setImportPreview(null); setError(null); setMessage(null);
    if (!file) return;
    try {
      const read = await readImportFile(file);
      setImportFile(read);
      setImportBackup(read.backup);
      setImportFileName(file.name);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not read this backup file.'));
    }
  }

  function chooseAutoBackup(backup: LinkShelfBackup, name: string) {
    setWarnings([]); setError(null); setMessage(null); setImportPreview(null);
    setImportFile({ source: 'LinkShelf', backup });
    setImportBackup(backup);
    setImportFileName(name);
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
      setImportBackup(null); setImportFile(null); setImportPreview(null); setImportFileName('');
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
      <SectionHeader title="Settings" description="Change how LinkShelf works, keep your data safe, and find help." />
      <nav aria-label="Settings groups" className="-mt-1 mb-2 flex flex-wrap gap-1 border-b border-slate-200">
        {groups.map(group => <a key={group.id} href={group.page === 'general' ? '#settings' : `#settings/${group.page}`}
          aria-current={page === group.page ? 'page' : undefined}
          className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm ${page === group.page ? 'border-blue-700 font-bold text-blue-800' : 'border-transparent font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900'}`}>
          {group.title}
        </a>)}
      </nav>

      {page === 'general' && <SettingsGroup {...groups[0]}>
        <SettingsPreferences preferences={preferences} disabled={isPreviewing || isImporting || importPreview !== null} />
        <TabGroupsSetting />
        <SidebarSetting />
        <SettingsCard id="settings-shortcuts" title="Keyboard shortcuts">
          <div className="mt-3 space-y-2">{[
            ['park-current-tab', 'Park current tab'],
            ['toggle-side-panel', 'Open or close LinkShelf'],
            ['open-search', 'Open Search'],
            ['open-today', 'Open Today'],
          ].map(([name, label]) => <div key={name} className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{label}</span><kbd className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold shadow-inner">{shortcuts[name] ?? 'Loading...'}</kbd></div>)}</div>
          <button type="button" className={buttonClass('secondary', 'mt-4 w-full')} onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts', active: true })}>Manage keyboard shortcuts</button>
        </SettingsCard>
      </SettingsGroup>}

      {page === 'data' && <SettingsGroup {...groups[1]}>
        <div className="lg:col-span-2">{feedback}</div>
        <SettingsCard id="settings-backup" title="Backup">
          <p className="mt-2 text-sm text-slate-600">Export projects, sessions, links, reminders, and settings as readable JSON. Chrome bookmarks are not included.</p>
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Backups can contain sensitive URLs and notes. Store the file securely.</p>
          <button type="button" className={buttonClass('secondary', 'mt-4 w-full')} disabled={isExporting} onClick={() => void downloadBackup()}>{isExporting ? 'Preparing backup...' : 'Download backup'}</button>
        </SettingsCard>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <AutoBackupsPanel disabled={isPreviewing || isImporting || preferences.saving || importPreview !== null} onChoose={chooseAutoBackup} />
        </section>

        <SettingsCard id="settings-import" title="Import backup or another tool’s export">
          <p className="mt-1 text-xs text-slate-500">Accepts LinkShelf JSON backups, and exports from OneTab (text), Session Buddy (JSON), Toby (JSON), Pocket (HTML) and browser bookmarks (HTML), up to {BACKUP_SIZE_LIMIT_LABEL}. Files from other tools are added as a new project; nothing is replaced. Imports must also fit the available Chrome storage space.</p>
          <label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Choose backup file
            <input ref={backupInput} type="file" disabled={isPreviewing || isImporting || preferences.saving} className="sr-only" accept="application/json,.json,.txt,.html,.htm,text/plain,text/html" onChange={(event) => void selectBackup(event.target.files?.[0])} />
          </label>

          {importBackup && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">{importFileName}</p>
            <p className="mt-1 text-xs">{importFile?.external ? `${importFile.source} export · ${importFile.external.linkCount} links in ${importFile.external.groupCount} groups${importFile.external.skipped ? ` · ${importFile.external.skipped} skipped (duplicates or unsupported addresses)` : ''}${importFile.external.truncated ? ' · stopped at the 20,000 link limit' : ''}` : `Exported ${new Date(importBackup.exportedAt).toLocaleString()}`}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Projects</dt><dd className="font-bold">{importBackup.database.projects.length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Sessions</dt><dd className="font-bold">{importBackup.database.sessions.length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Links</dt><dd className="font-bold">{importBackup.database.links.length}</dd></div></dl>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-center"><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Notes</dt><dd className="font-bold">{importBackup.database.sessions.filter((session) => !!session.note?.trim()).length + importBackup.database.links.filter((link) => !!link.note?.trim()).length}</dd></div><div className="rounded bg-white p-2"><dt className="text-xs text-slate-500">Reminders</dt><dd className="font-bold">{importBackup.database.links.filter((link) => link.reminderAt !== undefined).length}</dd></div></dl>
            <p className="mt-2 text-xs text-blue-800">{importBackup.database.links.filter((link) => link.status === 'parked').length} parked · {importBackup.database.links.filter((link) => link.status === 'archived').length} archived · {importBackup.database.links.filter((link) => link.status === 'restored' || link.status === 'removed').length} history</p>
            <p className="mt-3 text-xs">{importFile?.external ? 'Import adds these links as a new project and keeps your current settings.' : 'Merge adds missing records and keeps current settings. Replace all uses the backup as your library and applies its settings.'}</p>
            <div className="mt-3 flex gap-2"><button type="button" className={buttonClass('primary', 'flex-1')} disabled={isPreviewing || isImporting || preferences.saving} onClick={(event) => { importTrigger.current = event.currentTarget; void chooseImportMode('merge'); }}>{isPreviewing ? 'Checking...' : importFile?.external ? 'Import' : 'Merge'}</button>{!importFile?.external && <button type="button" className={buttonClass('danger-outline', 'flex-1')} disabled={isPreviewing || isImporting || preferences.saving} onClick={(event) => { importTrigger.current = event.currentTarget; void chooseImportMode('replace'); }}>Replace all</button>}</div>
          </div>}

          {importBackup && importPreview && <InlineConfirmation className={`mt-3 rounded-lg border p-3 ${importPreview.mode === 'replace' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`} titleId="confirm-import-title" title={<>Confirm {importPreview.mode} import</>}
            returnFocus={() => importTrigger.current?.isConnected ? importTrigger.current : backupInput.current}>
            <p className="mt-1 text-sm text-slate-700">{importPreview.mode === 'replace' ? `This will replace ${importPreview.current.projects} current projects, ${importPreview.current.sessions} sessions, and ${importPreview.current.links} links, including current settings.` : `This will add ${importPreview.projectsAdded} projects, ${importPreview.sessionsAdded} sessions, and ${importPreview.linksAdded} links. ${importPreview.recordsSkipped} matching records will be skipped and current settings will stay unchanged.`}</p>
            {importPreview.conflicts > 0 && <p className="mt-2 rounded bg-red-100 p-2 text-sm font-semibold text-red-800">{importPreview.conflicts} conflicting record relationship{importPreview.conflicts === 1 ? '' : 's'} must be resolved before this backup can be merged. Nothing will be changed.</p>}
            <div className="mt-3 flex gap-2"><button type="button" className={buttonClass(importPreview.mode === 'replace' ? 'danger' : 'primary', 'flex-1')} disabled={isImporting || importPreview.conflicts > 0} onClick={() => void confirmImport()}>{isImporting ? 'Importing...' : importPreview.mode === 'replace' ? 'Replace LinkShelf data' : 'Confirm merge'}</button><button type="button" className={buttonClass('ghost')} disabled={isImporting} onClick={() => setImportPreview(null)}>Cancel</button></div>
          </InlineConfirmation>}
        </SettingsCard>

        <SettingsCard id="settings-readable-export" title="Export to read or share">
          <p className="mt-1 text-xs text-slate-500">Create a Markdown or HTML list of saved and archived links with notes and tags. It is read-only and cannot be imported back. Use Download backup above for a restorable JSON copy.</p>
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="readable-project">Project</label>
          <Dropdown id="readable-project" className="mt-1 w-full" value={readableProject} disabled={isExporting} onChange={setReadableProject}
            options={[{ value: '', label: 'All projects' }, ...readableProjects.map(project => ({ value: project.id, label: project.name }))]} />
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="readable-format">Format</label>
          <Dropdown<ExportFormat> id="readable-format" className="mt-1 w-full" value={readableFormat} disabled={isExporting} onChange={setReadableFormat}
            options={[{ value: 'markdown', label: 'Markdown (.md)' }, { value: 'html', label: 'HTML (.html)' }] satisfies { value: ExportFormat; label: string }[]} />
          <button type="button" className={buttonClass('secondary', 'mt-3 w-full')} disabled={isExporting} onClick={() => void downloadReadable()}>{isExporting ? 'Preparing export...' : 'Download export'}</button>
        </SettingsCard>

        <SnapshotsPanel />
      </SettingsGroup>}

      {page === 'about' && <SettingsGroup {...groups[2]}>
        <SettingsCard id="settings-privacy" title="Privacy">
          <p className="mt-2 text-sm text-slate-600">LinkShelf stores its own data locally and does not send your links, notes, or bookmarks to a server.</p>
          <p className="mt-2 text-xs text-slate-500">Version {browser.runtime.getManifest().version}</p>
        </SettingsCard>

        <SettingsCard id="settings-permissions" title="Why these permissions?">
          <ul className="mt-2 space-y-2 text-sm text-slate-600"><li><strong>Tabs:</strong> save, close, and restore tabs you choose.</li><li><strong>Bookmarks:</strong> search and create native Chrome bookmarks.</li><li><strong>Alarms and notifications:</strong> deliver reminders.</li><li><strong>Storage:</strong> keep LinkShelf data on this device.</li><li><strong>Tab groups (optional):</strong> only if you turn on Keep tab groups, to remember and recreate groups.</li></ul>
        </SettingsCard>

        <SettingsCard id="settings-feedback" title="Help shape LinkShelf">
          <p className="mt-2 text-sm text-slate-600">Found a bug or have an idea? Early feedback directly guides the next release.</p>
          <div className="mt-3 flex flex-wrap gap-2"><a className={buttonClass('primary', 'flex-1')} href="mailto:ali.shaaban2002@gmail.com?subject=LinkShelf%20feedback">Send feedback</a><a className={buttonClass('secondary', 'flex-1')} href="https://github.com/AliShaab-an/linkshelf/issues" target="_blank" rel="noreferrer">Report issue</a></div>
          <a className={buttonClass('quiet', 'mt-2 w-full')} href={RATE_PROMPT_REVIEW_URL} target="_blank" rel="noreferrer">Rate LinkShelf on the Chrome Web Store</a>
        </SettingsCard>
      </SettingsGroup>}
    </>
  );
}

function SettingsGroup({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return <section aria-labelledby={`${id}-title`} className="mt-6 scroll-mt-4">
    <h3 id={`${id}-title`} tabIndex={-1} className="text-base font-bold text-slate-900">{title}</h3>
    <p className="mt-0.5 text-sm text-slate-600">{description}</p>
    {/* Two columns of cards on wide screens; the cards keep their natural height. */}
    <div className="mt-3 grid items-start gap-4 lg:grid-cols-2">{children}</div>
  </section>;
}

function SettingsCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={`${id}-title`} className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 id={`${id}-title`} className="font-semibold text-slate-900">{title}</h4>
    {children}
  </section>;
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
