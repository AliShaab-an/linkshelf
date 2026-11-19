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
  note?: string | null;
  projectName?: string;
  isDue?: boolean;
  density?: DisplayDensity;
  inSession?: boolean;
  showParkedDate?: boolean;
  isRestoring: boolean;
  onRestore?: () => void;
  onRestoreAndRemove?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onBookmark?: () => void;
  onMove?: () => void;
  onEditTags?: () => void;
  onRemind?: () => void;
  onRemove?: () => void;
}

export function SavedLinkCard({ cardId, link, note = link.note, projectName, isDue = false, density = 'comfortable', inSession = false, showParkedDate = true, isRestoring, onRestore, onRestoreAndRemove, onArchive, onUnarchive, onBookmark, onMove, onEditTags, onRemind, onRemove }: SavedLinkCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [opensDown, setOpensDown] = useState(false);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const actionsPanel = useRef<HTMLDivElement>(null);
  const actionsId = useId();
  const secondaryActions = Boolean(onMove || onEditTags || onRemind || onArchive || onUnarchive || onRemove || onRestoreAndRemove);
  // Without a primary action the menu button sits in the header instead of taking a row of its own.
  const menuInHeader = secondaryActions && !onRestore && !onBookmark;

  // The menu opens upward; flip it when sticky headers would cover its first items.
  useLayoutEffect(() => {
    if (!actionsOpen || menuInHeader) {
      setOpensDown(false);
      return;
    }
    const button = actionsButton.current;
    const panel = actionsPanel.current;
    if (!button || !panel) return;
    const styles = getComputedStyle(document.documentElement);
    const covered = ['--sidebar-shell-height', '--saved-toolbar-height']
      .reduce((total, name) => total + (Number.parseFloat(styles.getPropertyValue(name)) || 0), 0);
    setOpensDown(button.getBoundingClientRect().top - covered < panel.offsetHeight + 16);
  }, [actionsOpen]);

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
  const row = inSession && compact;
  const actionsTrigger = secondaryActions && <button ref={actionsButton} type="button" className="dropdown-trigger shrink-0" aria-label="More link actions" aria-expanded={actionsOpen && !isRestoring} aria-controls={actionsId} disabled={isRestoring} onClick={() => setActionsOpen((open) => !open)}><Icon name="more"/></button>;
  const primaryAction = 'inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold disabled:opacity-45';

  return <article id={cardId} data-saved-row={inSession || undefined} tabIndex={inSession ? 0 : undefined}
    aria-label={inSession ? link.title : undefined}
    aria-keyshortcuts={inSession ? 'ArrowUp ArrowDown Enter Delete' : undefined}
    className={`relative bg-white ${row ? 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 px-2 py-1.5' : `rounded-xl border ${compact ? 'p-2.5' : 'p-3'} ${isDue ? 'border-amber-300' : 'border-slate-200'}`}`}
    onKeyDown={(event) => {
      if (inSession && !isRestoring && event.target === event.currentTarget) {
        const shortcut = event.key === 'Enter' ? onRestore : event.key === 'Delete' ? onRemove : undefined;
        if (shortcut) {
          event.preventDefault();
          shortcut();
          return;
        }
      }
      if (event.key !== 'Escape' || !actionsOpen) return;
      event.preventDefault();
      event.stopPropagation();
      actionsButton.current?.focus();
      setActionsOpen(false);
    }}>
    <div className={`flex min-w-0 items-start ${row ? 'gap-2 pt-1' : 'gap-2.5'}`}>
      <LinkFavicon link={link} />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 wrap-anywhere text-sm font-semibold leading-snug text-slate-900" dir="auto" title={link.title}>{link.title}</h3>
        <p className="mt-0.5 truncate text-xs text-slate-600" title={projectName ? `${link.domain} · ${projectName}` : link.domain}>{link.domain}{projectName ? ` · ${projectName}` : ''}</p>
        {(showParkedDate || isDue || link.status === 'archived') && <p className={`mt-0.5 text-xs ${isDue ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{isDue && link.reminderAt ? `Parked · Due ${formatLinkDate(link.reminderAt)}` : link.status === 'archived' ? `Archived ${formatLinkDate(link.archivedAt ?? link.updatedAt)}` : `Parked ${formatLinkDate(link.createdAt)}`}</p>}
        {link.tags && link.tags.length > 0 && <CardTags tags={link.tags} />}
      </div>
      {menuInHeader && actionsTrigger}
    </div>
    {!row && note && <NotePreview note={note} />}

    {!menuInHeader && <div className={`flex items-center gap-1.5 ${row ? '' : compact ? 'mt-1.5' : 'mt-2.5'}`}>
      {onRestore && <button type="button" aria-label={isRestoring ? undefined : 'Restore link'} className={`${primaryAction} ${inSession ? 'text-blue-700 hover:bg-blue-50' : 'flex-1 bg-blue-700 text-white hover:bg-blue-800'}`} disabled={isRestoring} onClick={onRestore}>{!row && <Icon name="undo" className="size-4 shrink-0"/>}{isRestoring ? 'Working…' : 'Restore'}</button>}
      {onBookmark && <button type="button" aria-label="Bookmark in Chrome" className={`${primaryAction} flex-1 border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`} disabled={isRestoring} onClick={onBookmark}><Icon name="bookmark" className="size-4 shrink-0"/>Bookmark</button>}
      {actionsTrigger}
    </div>}
    {row && note && <div className="col-span-2"><NotePreview note={note} /></div>}

    {secondaryActions && <div id={actionsId} ref={actionsPanel} hidden={!actionsOpen || isRestoring}
      className={`dropdown-panel absolute right-4 ${menuInHeader ? 'top-14' : opensDown ? 'top-full mt-1' : 'bottom-14'} z-20 min-w-40 space-y-1`} role="group" aria-label="Link actions">
      {actionsOpen && !isRestoring && <>
        {onMove && <ActionButton onClick={() => action(onMove)}>Move to project</ActionButton>}
        {onArchive && <ActionButton onClick={() => action(onArchive)}>Archive</ActionButton>}
        {onEditTags && <ActionButton onClick={() => action(onEditTags)}>{link.tags?.length ? 'Edit tags' : 'Add tags'}</ActionButton>}
        {onRemind && <ActionButton onClick={() => action(onRemind)}>{isDue ? 'Snooze…' : link.reminderAt ? 'Change reminder' : 'Remind me…'}</ActionButton>}
        {onRestoreAndRemove && <ActionButton onClick={() => action(onRestoreAndRemove)}>Restore and remove from list</ActionButton>}
        {onUnarchive && <ActionButton onClick={() => action(onUnarchive)}>Return to project</ActionButton>}
        {onRemove && <ActionButton danger onClick={() => action(onRemove)}>Remove</ActionButton>}
      </>}
    </div>}
  </article>;
}

const VISIBLE_CARD_TAGS = 3;

/** A bounded tag summary: the first few tags plus a count, all named in the list label. */
function CardTags({ tags }: { tags: string[] }) {
  const shown = tags.slice(0, VISIBLE_CARD_TAGS);
  const hidden = tags.length - shown.length;
  return <ul className="mt-1 flex flex-wrap gap-1" aria-label="Tags" title={tags.join(', ')}>
    {shown.map((tag) => <li key={tag} className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700" dir="auto">{tag}</li>)}
    {hidden > 0 && <li className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700" aria-label={`and ${hidden} more: ${tags.slice(VISIBLE_CARD_TAGS).join(', ')}`}>+{hidden}</li>}
  </ul>;
}

export function LinkFavicon({ link }: { link: Pick<SavedLink, 'domain' | 'faviconUrl'> }) {
  return <span className="relative grid size-6 shrink-0 place-items-center overflow-hidden rounded border border-slate-300 bg-white text-xs font-bold text-slate-700" aria-hidden="true">
    {link.domain.charAt(0).toUpperCase()}
    {link.faviconUrl && <img key={link.faviconUrl} src={link.faviconUrl} alt="" className="absolute inset-0 size-full object-contain" style={{ backgroundColor: '#fff' }}
      onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}

export function NotePreview({ note }: { note: string }) {
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
