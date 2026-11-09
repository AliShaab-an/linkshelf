import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { DisplayDensity, SavedLink } from '@/domain/schemas';

export function formatLinkDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

interface SavedLinkCardProps {
  link: SavedLink;
  note?: string;
  projectName?: string;
  isDue?: boolean;
  showStatus?: boolean;
  density?: DisplayDensity;
  isRestoring: boolean;
  onRestore?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onBookmark?: () => void;
  onMove?: () => void;
  onRemove?: () => void;
}

export function SavedLinkCard({ link, note = link.note, projectName, isDue = false, showStatus = false, density = 'compact', isRestoring, onRestore, onArchive, onUnarchive, onBookmark, onMove, onRemove }: SavedLinkCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const secondaryActions = [
    { label: 'Move to project', callback: onMove },
    { label: 'Bookmark', callback: onBookmark },
    { label: 'Archive', callback: onArchive },
    { label: 'Return to project', callback: onUnarchive },
    { label: 'Remove', callback: onRemove },
  ].filter((item) => item.callback);

  return <article className={`rounded-xl border bg-white ${isDue ? 'border-amber-300' : 'border-slate-200'}`}>
    <div className={`flex items-center gap-2 ${density === 'comfortable' ? 'p-3' : 'p-2.5'}`}>
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`${expanded ? 'Hide' : 'Show'} details for ${link.title}`} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}>
        <span className="shrink-0 text-slate-400" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${expanded ? 'break-words' : 'truncate'}`} dir="auto" title={link.title}>{link.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{link.domain}{projectName ? ` · ${projectName}` : ''}</span></span>
      </button>
      {onRestore && <button type="button" className="min-h-10 shrink-0 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50" disabled={isRestoring} onClick={onRestore} aria-label={`Reopen ${link.title}`}>{isRestoring ? 'Opening…' : 'Reopen'}</button>}
    </div>
    {(isDue || showStatus || link.reminderAt) && <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
      {isDue ? <span className="font-semibold text-amber-800">Reminder due</span> : link.reminderAt && <span className="text-amber-800">Reminder {formatLinkDate(link.reminderAt)}</span>}
      {showStatus && <span className="capitalize text-slate-500">{link.status}</span>}
    </div>}
    <div id={detailsId} hidden={!expanded} className="border-t border-slate-100 px-3 pb-3 pt-2">
      <p className="break-all text-xs text-slate-500">{link.url}</p>
      <p className="mt-2 text-xs text-slate-500">{link.status === 'archived' ? `Archived ${formatLinkDate(link.archivedAt ?? link.updatedAt)}` : `Saved ${formatLinkDate(link.createdAt)}`}</p>
      {expanded && note && <NotePreview note={note} />}
      {secondaryActions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{secondaryActions.map(({ label, callback }) => <button key={label} type="button" className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${label === 'Remove' ? 'border-red-200 text-red-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`} disabled={isRestoring} onClick={callback}>{label}</button>)}</div>}
    </div>
  </article>;
}

function NotePreview({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const noteId = useId();

  useEffect(() => setExpanded(false), [note]);
  useLayoutEffect(() => {
    if (expanded || !noteRef.current) return;
    setCanExpand(noteRef.current.scrollHeight > noteRef.current.clientHeight + 1);
  }, [expanded, note]);

  return <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
    <p ref={noteRef} id={noteId} className={`${expanded ? '' : 'line-clamp-2'} whitespace-pre-wrap break-words text-sm leading-5 text-slate-600`} dir="auto">{note}</p>
    {canExpand && <button type="button" className="mt-1 text-xs font-semibold text-blue-700 hover:text-blue-800" aria-controls={noteId} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show less' : 'Show more'}</button>}
  </div>;
}
