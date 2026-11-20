import { useEffect, useState } from 'react';
import { buttonClass } from './ui/styles';
import type { LinkShelfBackup } from '@/domain/schemas';
import type { AutoBackupReason } from '@/domain/auto-backups';
import {
  deleteAutoBackup,
  getAutoBackup,
  getAutoBackups,
  setAutoBackupsEnabled,
  type AutoBackupResponse,
} from '@/messaging/contracts';
import type { AutoBackupList } from '@/features/backups/auto-backup-service';
import { OperationFeedback } from './ui/OperationFeedback';

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const reasonLabel = (reason: AutoBackupReason) => reason === 'before-import' ? 'Before replacing data' : 'Daily backup';
const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Rolling automatic backups kept inside the extension. Choosing one loads it into the
 * import area, so restoring uses the same preview and confirmation as any backup file.
 */
export function AutoBackupsPanel({ disabled, onChoose }: {
  disabled?: boolean;
  onChoose: (backup: LinkShelfBackup, name: string) => void;
}) {
  const [state, setState] = useState<AutoBackupList>({ enabled: true, backups: [] });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(response: AutoBackupResponse) {
    if (!response.success) throw new Error(response.error.message);
    const { success: _success, backup: _backup, ...list } = response;
    setState(list);
    setLoaded(true);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'LinkShelf could not update automatic backups.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let current = true;
    void getAutoBackups().then((response) => { if (current) apply(response); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : 'LinkShelf could not read automatic backups.'); });
    return () => { current = false; };
  }, []);

  return <section aria-labelledby="auto-backups-title">
    <h4 id="auto-backups-title" className="text-sm font-semibold text-slate-900">Automatic backups</h4>
    <p className="mt-1 text-xs text-slate-500">LinkShelf keeps up to 5 recent copies of your library inside the extension: one a day, plus one before you replace everything with an import. They stay on this device and are not a substitute for Download backup, because removing the extension deletes them.</p>
    <label className="mt-3 flex min-h-10 items-start gap-3 text-sm font-semibold">
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-blue-700" checked={state.enabled} disabled={busy || !loaded || disabled}
        onChange={(event) => {
          const next = event.target.checked;
          void run(async () => {
            apply(await setAutoBackupsEnabled(next));
            setMessage(next ? 'Automatic backups are on.' : 'Automatic backups are off and the saved copies were deleted.');
          });
        }} />
      <span>Keep automatic backups</span>
    </label>
    <OperationFeedback message={message} error={error} />
    {state.enabled && state.problem === 'space' && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">There isn’t enough free browser storage for another automatic copy, so the newest changes aren’t backed up. Use Download backup to keep a file.</p>}
    {state.enabled && state.problem === 'failed' && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">The last automatic backup could not be saved. Use Download backup to keep a file.</p>}
    {state.enabled && loaded && (state.backups.length === 0
      ? <p className="mt-2 text-sm text-slate-600">No automatic backups yet. The first one is made shortly after LinkShelf starts.</p>
      : <ul aria-label="Automatic backups" className="mt-2 space-y-2">
        {state.backups.map((backup) => <li key={backup.id} className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold">{dateFormatter.format(new Date(backup.createdAt))}</p>
          <p className="text-xs text-slate-600">{reasonLabel(backup.reason)} · {plural(backup.links, 'link')} in {plural(backup.projects, 'project')} · {sizeLabel(backup.bytes)}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={buttonClass('secondary', 'flex-1')} disabled={busy || disabled}
              aria-label={`Restore automatic backup from ${dateFormatter.format(new Date(backup.createdAt))}`}
              onClick={() => void run(async () => {
                const response = await getAutoBackup(backup.id);
                if (!response.success) throw new Error(response.error.message);
                if (!response.backup) throw new Error('LinkShelf could not load this automatic backup.');
                onChoose(response.backup, `Automatic backup · ${dateFormatter.format(new Date(backup.createdAt))}`);
                setMessage('Loaded below. Choose Merge or Replace all to continue.');
              })}>Restore…</button>
            <button type="button" className={buttonClass('danger-outline')} disabled={busy || disabled}
              aria-label={`Delete automatic backup from ${dateFormatter.format(new Date(backup.createdAt))}`}
              onClick={() => void run(async () => { apply(await deleteAutoBackup(backup.id)); setMessage('Automatic backup deleted.'); })}>Delete</button>
          </div>
        </li>)}
      </ul>)}
  </section>;
}
