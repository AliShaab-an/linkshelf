import { useEffect, useState } from 'react';
import type { SnapshotSummary } from '@/domain/snapshots';
import { deleteSnapshots, getSnapshots, restoreSnapshot, setSnapshotsEnabled, type SnapshotListResponse } from '@/messaging/contracts';
import { OperationFeedback } from './ui/OperationFeedback';

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const label = (snapshot: SnapshotSummary) => snapshot.reason === 'window-closed' ? 'Closed window' : 'Previous browser session';
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Opt-in rolling snapshots of open tabs. Stored locally, separately from saved links and backups. */
export function SnapshotsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string>();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);

  function apply(response: SnapshotListResponse) {
    if (!response.success) throw new Error(response.error.message);
    setEnabled(response.enabled);
    setSnapshots(response.snapshots);
    setLoaded(true);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null); setWarning(false);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'LinkShelf could not update snapshots.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let current = true;
    void getSnapshots().then((response) => { if (current) apply(response); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : 'LinkShelf could not read snapshots.'); });
    return () => { current = false; };
  }, []);

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="snapshots-title">
    <h3 id="snapshots-title" className="font-semibold">Recent window snapshots</h3>
    <p className="mt-2 text-sm text-slate-600">Keep the last 3 snapshots of your open tabs so you can bring back a window you closed by accident. Off by default.</p>
    <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">When on, LinkShelf stores the web addresses and titles of all your open tabs on this device, including pages you haven’t saved. Addresses may contain private parts. Nothing leaves your device, snapshots are not part of backups, and turning this off deletes them.</p>
    <label className="mt-3 flex min-h-10 items-start gap-3 text-sm font-semibold">
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-blue-700" checked={enabled} disabled={busy || !loaded}
        onChange={(event) => {
          const next = event.target.checked;
          void run(async () => {
            apply(await setSnapshotsEnabled(next));
            setMessage(next ? 'Snapshots are on. LinkShelf will keep the last 3.' : 'Snapshots are off and have been deleted.');
          });
        }} />
      <span>Keep recent window snapshots</span>
    </label>
    <OperationFeedback message={message} error={error} partial={warning} />
    {enabled && (snapshots.length === 0
      ? <p className="mt-2 text-sm text-slate-600">No snapshots yet. One is saved when you close a window or when Chrome restarts.</p>
      : <ul aria-label="Saved snapshots" className="mt-2 space-y-2">
        {snapshots.map((snapshot) => <li key={snapshot.id} className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold">{label(snapshot)}</p>
          <p className="text-xs text-slate-600">{dateFormatter.format(new Date(snapshot.capturedAt))} · {plural(snapshot.tabCount, 'tab')}{snapshot.windowCount > 1 ? ` in ${snapshot.windowCount} windows` : ''}{snapshot.truncated ? ' · some tabs left out (size limit)' : ''}</p>
          {confirming === snapshot.id
            ? <div className="mt-2" role="group" aria-label={`Restore ${label(snapshot)}`}>
              <p className="text-sm">Open {plural(snapshot.tabCount, 'tab')} in this window?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="flex-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}
                  onClick={() => void run(async () => {
                    const response = await restoreSnapshot(snapshot.id);
                    setConfirming(undefined);
                    if (!response.success) throw new Error(response.error.message);
                    setWarning(response.failed > 0);
                    setMessage(response.failed > 0 ? `Opened ${response.opened} of ${response.total} tabs. ${plural(response.failed, 'tab')} could not be opened.` : `Opened ${plural(response.opened, 'tab')}.`);
                  })}>{busy ? 'Opening…' : 'Open tabs'}</button>
                <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={() => setConfirming(undefined)}>Cancel</button>
              </div>
            </div>
            : <button type="button" className="mt-2 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-50" disabled={busy}
              aria-label={`Restore ${label(snapshot)} from ${dateFormatter.format(new Date(snapshot.capturedAt))}`} onClick={() => setConfirming(snapshot.id)}>Restore</button>}
        </li>)}
      </ul>)}
    {enabled && snapshots.length > 0 && <button type="button" className="mt-3 w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50" disabled={busy}
      onClick={() => void run(async () => { apply(await deleteSnapshots()); setMessage('Snapshots deleted. Snapshots stay on.'); })}>Delete all snapshots</button>}
  </section>;
}
