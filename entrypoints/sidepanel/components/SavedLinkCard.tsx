import { useState } from 'react';
import type { SavedLink } from '@/domain/schemas';
import { Icon } from './ui/Icon';

export function formatLinkDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

interface SavedLinkCardProps {
  link: SavedLink;
  projectName?: string;
  isDue?: boolean;
  showStatus?: boolean;
  isRestoring: boolean;
  onRestore?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onBookmark?: () => void;
  onMove?: () => void;
  onRemove?: () => void;
}

export function SavedLinkCard({ link, projectName, isDue = false, showStatus = false, isRestoring, onRestore, onArchive, onUnarchive, onBookmark, onMove, onRemove }: SavedLinkCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const secondaryActions = Boolean(onMove || onArchive || onUnarchive || onRemove);
  const favicon = link.faviconUrl;

  function action(callback?: () => void) {
    setIsMenuOpen(false);
    callback?.();
  }

  return <article className={`relative rounded-2xl border bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:-translate-y-px hover:shadow-md ${isDue ? 'border-amber-300' : 'border-slate-200'}`}>
    <div className="flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-sm font-extrabold text-slate-500">
        {favicon ? <img src={favicon} alt="" className="size-5"/> : link.domain.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 break-words font-bold leading-snug text-slate-900" dir="auto">{link.title}</h3>
          <div className="flex shrink-0 items-center gap-1">
            {isDue && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">Due</span>}
            {showStatus && !isDue && <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${link.status === 'archived' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>{link.status}</span>}
          </div>
        </div>
        <p className="mt-1 truncate text-sm text-slate-500">{link.domain}{projectName ? ` · ${projectName}` : ''}</p>
        <p className={`mt-1.5 text-xs ${isDue ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{isDue && link.reminderAt ? `Reminder ${formatLinkDate(link.reminderAt)}` : link.status === 'archived' ? `Archived ${formatLinkDate(link.archivedAt ?? link.updatedAt)}` : `Parked ${formatLinkDate(link.createdAt)}`}</p>
      </div>
    </div>
    {link.note && <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-600" dir="auto">{link.note}</p>}

    <div className="mt-3 flex items-center gap-2">
      {onRestore && <button type="button" className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-45" disabled={isRestoring} onClick={onRestore}><Icon name="undo"/>{isRestoring ? 'Working...' : 'Restore'}</button>}
      {onBookmark && <button type="button" className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-45" disabled={isRestoring} onClick={onBookmark}><Icon name="bookmark"/>Keep</button>}
      {secondaryActions && <button type="button" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="More link actions" aria-expanded={isMenuOpen} disabled={isRestoring} onClick={() => setIsMenuOpen((open) => !open)}><Icon name="more"/></button>}
    </div>

    {isMenuOpen && <div className="absolute bottom-14 right-4 z-20 min-w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" role="menu">
      {onMove && <MenuButton onClick={() => action(onMove)}>Move to project</MenuButton>}
      {onArchive && <MenuButton onClick={() => action(onArchive)}>Archive</MenuButton>}
      {onUnarchive && <MenuButton onClick={() => action(onUnarchive)}>Return to project</MenuButton>}
      {onRemove && <MenuButton danger onClick={() => action(onRemove)}>Remove</MenuButton>}
    </div>}
  </article>;
}

function MenuButton({ children, danger = false, onClick }: { children: string; danger?: boolean; onClick(): void }) {
  return <button type="button" role="menuitem" className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50 ${danger ? 'text-red-700' : 'text-slate-700'}`} onClick={onClick}>{children}</button>;
}
