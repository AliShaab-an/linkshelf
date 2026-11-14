import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { DisplayDensity, SavedLink } from '@/domain/schemas';
import { Icon } from './ui/Icon';

const linkDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatLinkDate(value: string): string {
  return linkDateFormatter.format(new Date(value));
}

interface SavedLinkCardProps {
  cardId?: string;
  link: SavedLink;
  note?: string;
  projectName?: string;
  isDue?: boolean;
  density?: DisplayDensity;
  isRestoring: boolean;
  onRestore?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onBookmark?: () => void;
  onMove?: () => void;
  onRemove?: () => void;
}

export function SavedLinkCard({ cardId, link, note = link.note, projectName, isDue = false, density = 'comfortable', isRestoring, onRestore, onArchive, onUnarchive, onBookmark, onMove, onRemove }: SavedLinkCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const actionsPanel = useRef<HTMLDivElement>(null);
  const actionsId = useId();
  const secondaryActions = Boolean(onMove || onArchive || onUnarchive || onRemove);
  const favicon = link.faviconUrl;

  useEffect(() => {
    if (!actionsOpen) return;
    function closeOutside(event: Event) {
      if (!(event.target instanceof Node) || actionsButton.current?.contains(event.target) ||
          actionsPanel.current?.contains(event.target)) return;
      setActionsOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [actionsOpen]);

  function action(callback?: () => void) {
    actionsButton.current?.focus({ preventScroll: true });
    setActionsOpen(false);
    callback?.();
  }

  const compact = density === 'compact';
  const primaryAction = 'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold disabled:opacity-45';

  return <article id={cardId} className={`relative rounded-xl border bg-white ${compact ? 'p-2.5' : 'p-3'} ${isDue ? 'border-amber-300' : 'border-slate-200'}`}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || !actionsOpen) return;
      event.preventDefault();
      event.stopPropagation();
      actionsButton.current?.focus();
      setActionsOpen(false);
    }}>
    <div className="flex items-start gap-2.5">
      <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-sm font-extrabold text-slate-600 ${compact ? 'size-7' : 'size-9'}`}>
        {favicon ? <img src={favicon} alt="" className="size-5"/> : link.domain.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 wrap-anywhere text-sm font-semibold leading-snug text-slate-900" dir="auto" title={link.title}>{link.title}</h3>
        <p className="mt-0.5 truncate text-xs text-slate-600" title={projectName ? `${link.domain} · ${projectName}` : link.domain}>{link.domain}{projectName ? ` · ${projectName}` : ''}</p>
        <p className={`mt-0.5 text-xs ${isDue ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{isDue && link.reminderAt ? `Parked · Due ${formatLinkDate(link.reminderAt)}` : link.status === 'archived' ? `Archived ${formatLinkDate(link.archivedAt ?? link.updatedAt)}` : `Parked ${formatLinkDate(link.createdAt)}`}</p>
      </div>
    </div>
    {note && <NotePreview note={note} />}

    <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} flex items-center gap-1.5`}>
      {onRestore && <button type="button" aria-label={isRestoring ? undefined : 'Restore link'} className={`${primaryAction} bg-blue-700 text-white hover:bg-blue-800`} disabled={isRestoring} onClick={onRestore}><Icon name="undo" className="size-4 shrink-0"/>{isRestoring ? 'Working…' : 'Restore'}</button>}
      {onBookmark && <button type="button" aria-label="Bookmark in Chrome" className={`${primaryAction} border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`} disabled={isRestoring} onClick={onBookmark}><Icon name="bookmark" className="size-4 shrink-0"/>Bookmark</button>}
      {secondaryActions && <button ref={actionsButton} type="button" className="dropdown-trigger shrink-0" aria-label="More link actions" aria-expanded={actionsOpen && !isRestoring} aria-controls={actionsId} disabled={isRestoring} onClick={() => setActionsOpen((open) => !open)}><Icon name="more"/></button>}
    </div>

    {secondaryActions && <div id={actionsId} ref={actionsPanel} hidden={!actionsOpen || isRestoring}
      className="dropdown-panel absolute right-4 bottom-14 z-20 min-w-40 space-y-1" role="group" aria-label="Link actions">
      {actionsOpen && !isRestoring && <>
        {onMove && <ActionButton onClick={() => action(onMove)}>Move to project</ActionButton>}
        {onArchive && <ActionButton onClick={() => action(onArchive)}>Archive</ActionButton>}
        {onUnarchive && <ActionButton onClick={() => action(onUnarchive)}>Return to project</ActionButton>}
        {onRemove && <ActionButton danger onClick={() => action(onRemove)}>Remove</ActionButton>}
      </>}
    </div>}
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

  return <div className="mt-2 border-s-2 border-slate-200 ps-2">
    <p ref={noteRef} id={noteId} className={`${expanded ? '' : 'line-clamp-2'} whitespace-pre-wrap wrap-anywhere text-sm leading-5 text-slate-600`} dir="auto">{note}</p>
    {canExpand && <button type="button" className="min-h-8 rounded text-xs font-semibold text-blue-700 hover:text-blue-800" aria-controls={noteId} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show less' : 'Show more'}</button>}
  </div>;
}

function ActionButton({ children, danger = false, onClick }: { children: string; danger?: boolean; onClick(): void }) {
  return <button type="button" className={`dropdown-action ${danger ? 'text-red-700 hover:bg-red-50' : ''}`} onClick={onClick}>{children}</button>;
}
