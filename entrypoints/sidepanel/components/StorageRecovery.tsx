import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { readBackupFile } from '@/domain/backup';
import { stringifyRecoveryExport, type StorageStatus } from '@/domain/recovery';
import type { LinkShelfBackup } from '@/domain/schemas';
import type { RecoveryBackupPreview } from '@/storage/repository';
import { exportRecoveryData, getStorageStatus, previewRecoveryBackup, restoreRecoveryBackup } from '@/messaging/contracts';
import { InlineConfirmation } from './ui/InlineConfirmation';
import { OperationWarnings } from './ui/OperationWarnings';

export function StorageRecoveryGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [notice, setNotice] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async (recheck = false) => {
    const request = ++generation.current;
    try {
      const result = await getStorageStatus(recheck);
      if (request !== generation.current) return;
      if (!result.success) throw new Error(result.error.message);
      if (result.status.state === 'recovery') { setNotice([]); setMessage(''); }
      setStatus(result.status);
    } catch {
      if (request === generation.current) setStatus({ state: 'recovery', diagnostics: [{ code: 'STORAGE_UNAVAILABLE', path: [], message: 'Stored data could not be checked. Reconnect to the extension and check again.' }] });
    }
  }, []);
  useEffect(() => {
    void load();
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && Object.hasOwn(changes, 'linkshelfDatabase') && !busy.current) void load();
    };
    browser.storage.onChanged.addListener(changed);
    return () => { generation.current++; browser.storage.onChanged.removeListener(changed); };
  }, [load]);
  if (!status) return <p role="status" className="mx-auto max-w-2xl rounded-xl bg-white p-4 text-sm text-slate-500">Checking saved data...</p>;
  if (status.state === 'healthy') return <>{message && <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}<OperationWarnings warnings={notice} />{children}</>;
  return <div className="mx-auto max-w-2xl p-4"><StorageRecoveryPanel status={status} onBusy={(active) => { busy.current = active; if (active) generation.current++; }} onRecheck={() => load(true)} onRecovered={async (warnings, count) => {
    setMessage(`Backup restored: ${count} links loaded.`); setNotice(warnings);
    await load();
  }} /></div>;
}

function StorageRecoveryPanel({ status, onBusy, onRecheck, onRecovered }: {
  status: Extract<StorageStatus, { state: 'recovery' }>;
  onBusy(active: boolean): void;
  onRecheck(): Promise<void>;
  onRecovered(warnings: string[], count: number): Promise<void>;
}) {
  const [rawToken, setRawToken] = useState('');
  const [savedRaw, setSavedRaw] = useState(false);
  const [backup, setBackup] = useState<LinkShelfBackup | null>(null);
  const [preview, setPreview] = useState<RecoveryBackupPreview | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function act(action: () => Promise<void>) {
    setWorking(true); onBusy(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Recovery could not complete. Check stored data again.'); }
    finally { setWorking(false); onBusy(false); }
  }
  async function downloadRaw() {
    await act(async () => {
      const response = await exportRecoveryData();
      if (!response.success) throw new Error(response.error.message);
      const url = URL.createObjectURL(new Blob([stringifyRecoveryExport(response.recovery)], { type: 'application/json' }));
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `linkshelf-raw-recovery-${response.recovery.exportedAt.slice(0, 10)}.json`;
        anchor.click();
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 0); }
      setRawToken(response.recovery.rawRevisionToken); setSavedRaw(false); setPreview(null);
      setMessage('Recovery download requested. Confirm that you saved the file securely before replacing stored data.');
    });
  }
  async function selectFile(file?: File) {
    setBackup(null); setPreview(null); setError('');
    if (!file) return;
    await act(async () => { setBackup(await readBackupFile(file)); });
  }
  const reviewTrigger = useRef<HTMLButtonElement>(null);

  async function review() {
    if (!backup || !rawToken || !savedRaw) return;
    await act(async () => {
      const response = await previewRecoveryBackup(backup, rawToken);
      if (!response.success) throw new Error(response.error.message);
      setPreview(response.preview);
    });
  }
  async function restore() {
    if (!backup || !preview || !savedRaw) return;
    await act(async () => {
      const response = await restoreRecoveryBackup(backup, rawToken, preview.revisionToken, true);
      if (!response.success) throw new Error(response.error.message);
      await onRecovered(response.warnings ?? [], response.result.linksAdded);
    });
  }
  return <section className="space-y-4 rounded-xl border border-amber-300 bg-white p-4 shadow-sm" aria-labelledby="storage-recovery-title">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Local data protection</p>
      <h2 id="storage-recovery-title" className="mt-1 text-lg font-bold">Stored data needs attention</h2>
      <p className="mt-2 text-sm text-slate-600">LinkShelf has paused saved-data actions. The stored value has not been reset or automatically repaired. Preserve a recovery copy before restoring a trusted backup.</p>
    </div>
    <details className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
      <summary className="cursor-pointer font-semibold">Storage diagnostics</summary>
      <ul className="mt-2 space-y-1">{status.diagnostics.map((issue, index) => <li key={index}><strong>{issue.code}</strong>: {issue.message}{issue.path.length ? ` (${issue.path.join('.')})` : ''}</li>)}</ul>
      {status.diagnostics.length >= 100 && <p className="mt-2">Showing the first 100 issues. The raw export preserves the full stored value.</p>}
    </details>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    <div className="border-t border-slate-200 pt-4">
      <h3 className="font-semibold">1. Preserve the original data</h3>
      <p className="mt-1 text-sm text-slate-600">The raw recovery file may contain private URLs, titles, and notes. Keep it secure. It is not a verified LinkShelf backup and cannot be imported normally.</p>
      <button type="button" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={working} onClick={() => void downloadRaw()}>Export raw recovery data</button>
      {rawToken && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={working} checked={savedRaw} onChange={(event) => { setSavedRaw(event.target.checked); setPreview(null); }} />I saved the raw recovery file securely.</label>}
    </div>
    <div className="border-t border-slate-200 pt-4">
      <h3 className="font-semibold">2. Choose a trusted backup</h3>
      <p className="mt-1 text-sm text-slate-600">Choose a valid version-1 or version-2 LinkShelf backup, up to 32 MiB. Recovery replaces stored data; it does not merge or guess how to fix broken records.</p>
      <label className="mt-3 block text-sm font-medium">Recovery backup file<input type="file" accept="application/json,.json" className="mt-2 block w-full text-xs" disabled={working || !savedRaw} onChange={(event) => void selectFile(event.target.files?.[0])} /></label>
      <button ref={reviewTrigger} type="button" className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={working || !backup || !savedRaw} onClick={() => void review()}>Review recovery backup</button>
    </div>
    {preview && <InlineConfirmation titleId="confirm-recovery-title" title="3. Confirm recovery replacement"
      className="rounded-lg border border-red-300 bg-red-50 p-3" returnFocus={() => reviewTrigger.current}>
      <p className="mt-2 text-sm">This will replace the currently stored value with {preview.source.projects} projects, {preview.source.sessions} sessions, and {preview.source.links} links, including backup settings. Your raw recovery file is the independent copy of the original data.</p>
      <div className="mt-3 flex gap-2"><button type="button" className="flex-1 rounded-lg bg-red-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={working || !savedRaw} onClick={() => void restore()}>{working ? 'Restoring...' : 'Replace stored data from backup'}</button><button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold" disabled={working} onClick={() => setPreview(null)}>Cancel</button></div>
    </InlineConfirmation>}
    <button type="button" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={working} onClick={() => void act(onRecheck)}>Check stored data again</button>
  </section>;
}
