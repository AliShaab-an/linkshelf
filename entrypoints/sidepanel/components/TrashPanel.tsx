import { useEffect, useState } from 'react';
import { buttonClass } from './ui/styles';
import type { SavedLink } from '@/domain/schemas';
import { deleteFromTrash, emptyTrash, getTrash, restoreFromTrash, type TrashResponse } from '@/messaging/contracts';
import { OperationFeedback } from './ui/OperationFeedback';
import { EmptyState } from './ui/Feedback';
import { Icon } from './ui/Icon';
import { SectionHeader } from './ui/SectionHeader';
import { LinkFavicon } from './SavedLinkCard';

const VISIBLE = 25;
const DAY = 86_400_000;
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function daysLeft(link: SavedLink, retentionDays: number, now = Date.now()): number {
  const removed = new Date(link.removedAt ?? link.updatedAt).getTime();
  return Math.max(0, Math.ceil((removed + retentionDays * DAY - now) / DAY));
}

/** The Manager's Bin: removed links stay here for 30 days so a mistake can be undone. */
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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'LinkShelf could not update the bin.'); }
    finally { setBusy(false); setConfirming(undefined); }
  }

  useEffect(() => {
    let version = 0;
    let timeout: ReturnType<typeof setTimeout>;
    const load = () => {
      const request = ++version;
      void getTrash().then((response) => { if (request === version) apply(response); })
        .catch((cause) => { if (request === version) setError(cause instanceof Error ? cause.message : 'LinkShelf could not load the bin.'); });
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

  return <section aria-labelledby="bin-title">
    <SectionHeader headingId="bin-title" title="Bin"
      description={`Removed links stay here for ${retentionDays} days, then are deleted for good. Recover one to put it back where it was.`}
      action={links.length > 0 && confirming !== '*'
        ? <button type="button" className={buttonClass('danger-outline')} disabled={busy} onClick={() => setConfirming('*')}>Empty bin</button>
        : undefined} />
    <OperationFeedback message={message} error={error} />
    {links.length > 0 && confirming === '*' && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3" role="group" aria-label="Empty bin">
      <p className="text-sm text-red-900">Permanently delete {plural(links.length, 'removed link')}? This cannot be undone.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={buttonClass('danger')} disabled={busy}
          onClick={() => void run(async () => { const response = await emptyTrash(); apply(response); setMessage(`Deleted ${plural(response.success ? response.affected : 0, 'link')} permanently.`); })}>Empty bin</button>
        <button type="button" className={buttonClass('ghost')} disabled={busy} onClick={() => setConfirming(undefined)}>Cancel</button>
      </div>
    </div>}
    {loaded && links.length === 0 && <EmptyState title="The bin is empty">Links you remove come here first, so a mistake can be undone.</EmptyState>}
    {shown.length > 0 && <ul aria-label="Removed links" className="space-y-2">
      {shown.map((link) => <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <LinkFavicon link={link} />
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-sm font-semibold text-slate-900" dir="auto" title={link.title}>{link.title}</p>
          <p className="truncate text-xs text-slate-600">{link.domain} · Removed {dateFormatter.format(new Date(link.removedAt ?? link.updatedAt))} · {daysLeft(link, retentionDays) === 0 ? 'deleted soon' : `${plural(daysLeft(link, retentionDays), 'day')} left`}</p>
        </div>
        {confirming === link.id
          ? <div className="ml-auto flex flex-wrap items-center gap-2" role="group" aria-label={`Delete ${link.title} permanently`}>
            <span className="text-sm text-slate-700">Delete for good?</span>
            <button type="button" className={buttonClass('danger')} disabled={busy}
              onClick={() => void run(async () => { apply(await deleteFromTrash(link.id)); setMessage('Link deleted permanently.'); })}>Delete permanently</button>
            <button type="button" className={buttonClass('ghost')} disabled={busy} onClick={() => setConfirming(undefined)}>Cancel</button>
          </div>
          : <div className="ml-auto flex items-center gap-1">
            <button type="button" className={buttonClass('quiet')} disabled={busy} aria-label={`Recover ${link.title}`}
              onClick={() => void run(async () => { apply(await restoreFromTrash(link.id)); setMessage(`Recovered “${link.title}”.`); })}><Icon name="undo" className="size-4" />Recover</button>
            <button type="button" className={buttonClass('danger-outline', 'border-transparent')} disabled={busy} aria-label={`Delete ${link.title} permanently`}
              onClick={() => setConfirming(link.id)}><Icon name="trash" className="size-4" />Delete</button>
          </div>}
      </li>)}
    </ul>}
    {links.length > VISIBLE && <p className="mt-2 text-xs text-slate-600">Showing the newest {VISIBLE} of {links.length} removed links.</p>}
  </section>;
}
