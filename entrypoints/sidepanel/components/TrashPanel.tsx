import { useEffect, useState } from 'react';
import { buttonClass } from './ui/styles';
import type { SavedLink } from '@/domain/schemas';
import { deleteFromTrash, emptyTrash, getTrash, restoreFromTrash, type TrashResponse } from '@/messaging/contracts';
import { OperationFeedback } from './ui/OperationFeedback';

const VISIBLE = 25;
const DAY = 86_400_000;
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function daysLeft(link: SavedLink, retentionDays: number, now = Date.now()): number {
  const removed = new Date(link.removedAt ?? link.updatedAt).getTime();
  return Math.max(0, Math.ceil((removed + retentionDays * DAY - now) / DAY));
}

/** Removed links stay here for 30 days so a mistake can be undone. */
export function TrashPanel() {
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string>();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(response: TrashResponse) {
    if (!response.success) throw new Error(response.error.message);
    setLinks(response.links);
    setRetentionDays(response.retentionDays);
    setLoaded(true);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'LinkShelf could not update the trash.'); }
    finally { setBusy(false); setConfirming(undefined); }
  }

  useEffect(() => {
    let version = 0;
    let timeout: ReturnType<typeof setTimeout>;
    const load = () => {
      const request = ++version;
      void getTrash().then((response) => { if (request === version) apply(response); })
        .catch((cause) => { if (request === version) setError(cause instanceof Error ? cause.message : 'LinkShelf could not load the trash.'); });
    };
    const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !Object.hasOwn(changes, 'linkshelfDatabase')) return;
      clearTimeout(timeout);
      timeout = setTimeout(load, 150);
    };
    browser.storage.onChanged.addListener(changed);
    load();
    return () => { version++; clearTimeout(timeout); browser.storage.onChanged.removeListener(changed); };
  }, []);

  const shown = links.slice(0, VISIBLE);

  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="trash-title">
    <h3 id="trash-title" className="font-semibold text-slate-900">Recently removed</h3>
    <p className="mt-1 text-sm text-slate-600">Removed links stay here for {retentionDays} days, then are deleted for good. Recover one to put it back where it was.</p>
    <OperationFeedback message={message} error={error} />
    {loaded && links.length === 0 && <p className="mt-2 text-sm text-slate-600">Nothing removed recently.</p>}
    {shown.length > 0 && <ul aria-label="Removed links" className="mt-3 space-y-2">
      {shown.map((link) => <li key={link.id} className="rounded-lg border border-slate-200 p-3">
        <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{link.title}</p>
        <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">{link.domain} · Removed {dateFormatter.format(new Date(link.removedAt ?? link.updatedAt))} · {daysLeft(link, retentionDays) === 0 ? 'deleted soon' : `${plural(daysLeft(link, retentionDays), 'day')} left`}</p>
        {confirming === link.id
          ? <div className="mt-2" role="group" aria-label={`Delete ${link.title} permanently`}>
            <p className="text-sm">Delete this link permanently? This cannot be undone.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={buttonClass('danger', 'flex-1')} disabled={busy}
                onClick={() => void run(async () => { apply(await deleteFromTrash(link.id)); setMessage('Link deleted permanently.'); })}>Delete permanently</button>
              <button type="button" className={buttonClass('ghost')} disabled={busy} onClick={() => setConfirming(undefined)}>Cancel</button>
            </div>
          </div>
          : <div className="mt-2 flex gap-2">
            <button type="button" className={buttonClass('secondary', 'flex-1')} disabled={busy} aria-label={`Recover ${link.title}`}
              onClick={() => void run(async () => { apply(await restoreFromTrash(link.id)); setMessage(`Recovered “${link.title}”.`); })}>Recover</button>
            <button type="button" className={buttonClass('danger-outline')} disabled={busy} aria-label={`Delete ${link.title} permanently`}
              onClick={() => setConfirming(link.id)}>Delete</button>
          </div>}
      </li>)}
    </ul>}
    {links.length > VISIBLE && <p className="mt-2 text-xs text-slate-600">Showing the newest {VISIBLE} of {links.length} removed links.</p>}
    {links.length > 0 && (confirming === '*'
      ? <div className="mt-3" role="group" aria-label="Empty trash">
        <p className="text-sm">Permanently delete {plural(links.length, 'removed link')}? This cannot be undone.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className={buttonClass('danger', 'flex-1')} disabled={busy}
            onClick={() => void run(async () => { const response = await emptyTrash(); apply(response); setMessage(`Deleted ${plural(response.success ? response.affected : 0, 'link')} permanently.`); })}>Empty trash</button>
          <button type="button" className={buttonClass('ghost')} disabled={busy} onClick={() => setConfirming(undefined)}>Cancel</button>
        </div>
      </div>
      : <button type="button" className={buttonClass('danger-outline', 'mt-3 w-full')} disabled={busy} onClick={() => setConfirming('*')}>Empty trash</button>)}
  </section>;
}
