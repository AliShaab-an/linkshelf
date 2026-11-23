import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildLibrary, moveInLibrary, type LibraryCard, type LibraryLink } from '@/domain/library';
import type { RestoreMode } from '@/domain/schemas';
import { getParkedSessionGroups, getProjects, getSettings, moveLink, restoreLink, restoreProject } from '@/messaging/contracts';
import { describeCollectionRestore, describeLinkRestore } from '../restore-feedback';
import { LinkFavicon } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { Icon } from './ui/Icon';
import { SectionHeader } from './ui/SectionHeader';
import { buttonClass } from './ui/styles';

/** Links shown on a card before "Show more", so a large project does not push the others off the page. */
const CARD_LINK_LIMIT = 8;
const DRAG_TYPE = 'application/x-linkshelf-link';

/** A board of project cards. Drag a link onto another card to move it, or use its "Move" menu. */
export function LibrarySection() {
  const heading = useRef<HTMLHeadingElement>(null);
  const [cards, setCards] = useState<LibraryCard[]>();
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('normal');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const cardsRef = useRef<LibraryCard[] | undefined>(undefined);
  cardsRef.current = cards;

  const load = useCallback(async () => {
    try {
      const [projects, groups, settings] = await Promise.all([getProjects(), getParkedSessionGroups(), getSettings()]);
      if (!projects.success) throw new Error(projects.error.message);
      if (!groups.success) throw new Error(groups.error.message);
      if (settings.success) setRestoreMode(settings.settings.defaultRestoreMode);
      setCards(buildLibrary(projects.projects, groups.groups));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LinkShelf could not load your library.');
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  const names = useMemo(() => new Map((cards ?? []).map(card => [card.project.id, card.project.name])), [cards]);

  async function move(linkId: string, projectId: string) {
    const before = cardsRef.current;
    const entry = before?.flatMap(card => card.links).find(candidate => candidate.link.id === linkId);
    if (!before || !entry || entry.link.projectId === projectId) return;
    // Show the result at once; put things back if the worker refuses.
    setCards(moveInLibrary(before, linkId, projectId));
    setStatus('');
    try {
      const response = await moveLink(linkId, projectId);
      if (!response.success) throw new Error(response.error.message);
      setStatus(`Moved “${entry.link.title}” to ${names.get(projectId) ?? 'the project'}.`);
    } catch (caught) {
      setCards(before);
      setStatus(caught instanceof Error ? caught.message : 'LinkShelf could not move that link.');
    }
  }

  async function open(entry: LibraryLink) {
    setBusy(entry.link.id);
    try {
      setStatus(describeLinkRestore(await restoreLink(entry.link.id)));
      await load();
    } finally { setBusy(undefined); }
  }

  async function restoreAll(card: LibraryCard) {
    setConfirming(undefined);
    setBusy(card.project.id);
    try {
      setStatus(describeCollectionRestore(await restoreProject(card.project.id, restoreMode)));
      await load();
    } finally { setBusy(undefined); }
  }

  function toggle(projectId: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (!next.delete(projectId)) next.add(projectId);
      return next;
    });
  }

  const total = cards?.reduce((sum, card) => sum + card.links.length, 0) ?? 0;

  return <div>
    <SectionHeader headingRef={heading} title="Library"
      description="Every project and the links waiting in it. Drag a link onto another project to move it." />
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <p role="status" className="mb-3 min-h-5 text-sm text-slate-700">{status}</p>
    {!cards && !error && <SkeletonCards count={3} />}
    {cards && total === 0 && cards.length <= 1 && <EmptyState title="Nothing parked yet">Park some tabs from the sidebar and they will be laid out here by project.</EmptyState>}
    {cards && (total > 0 || cards.length > 1) && <div className="gap-4 [column-width:19rem]">
      {cards.map(card => {
        const isOpen = expanded.has(card.project.id);
        const shown = isOpen ? card.links : card.links.slice(0, CARD_LINK_LIMIT);
        const targeted = over === card.project.id && dragging !== undefined;
        return <section key={card.project.id} aria-labelledby={`lib-${card.project.id}`}
          className={`mb-4 flex min-w-0 break-inside-avoid flex-col rounded-xl border bg-white p-3 transition-colors ${targeted ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200'}`}
          onDragEnter={event => { if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault(); }}
          onDragOver={event => { if (event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(card.project.id); } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(undefined); }}
          onDrop={event => {
            event.preventDefault();
            const id = event.dataTransfer.getData(DRAG_TYPE) || dragging;
            setOver(undefined);
            setDragging(undefined);
            if (id) void move(id, card.project.id);
          }}>
          <div className="flex items-center justify-between gap-2">
            <h3 id={`lib-${card.project.id}`} className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
              <Icon name="folder" className="size-4 shrink-0 text-blue-700" /><span className="truncate" dir="auto">{card.project.name}</span>
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{card.links.length}</span>
          </div>
          {card.links.length === 0
            ? <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">Empty. Drop a link here.</p>
            : <ul className="mt-2 divide-y divide-slate-100">
              {shown.map(entry => <li key={entry.link.id} draggable={busy === undefined}
                className={`flex items-start gap-2 py-2 ${dragging === entry.link.id ? 'opacity-40' : ''}`}
                onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, entry.link.id); event.dataTransfer.effectAllowed = 'move'; setDragging(entry.link.id); }}
                onDragEnd={() => { setDragging(undefined); setOver(undefined); }}>
                <span className="mt-0.5"><LinkFavicon link={entry.link} /></span>
                <div className="min-w-0 flex-1">
                  <button type="button" className="block w-full truncate text-left text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline disabled:opacity-50"
                    disabled={busy !== undefined} title={entry.link.url} dir="auto" onClick={() => void open(entry)}>
                    {entry.link.title}
                  </button>
                  <span className="block truncate text-xs text-slate-600">{entry.link.domain}{entry.sessionName ? ` · ${entry.sessionName}` : ''}</span>
                </div>
                <select aria-label={`Move ${entry.link.title} to another project`} value="" disabled={busy !== undefined}
                  className="h-8 w-20 shrink-0 rounded-md border border-transparent bg-transparent px-1 text-xs text-slate-600 hover:border-slate-300 focus:border-slate-300"
                  onChange={event => { if (event.target.value) void move(entry.link.id, event.target.value); }}>
                  <option value="">Move…</option>
                  {cards.filter(other => other.project.id !== entry.link.projectId).map(other => <option key={other.project.id} value={other.project.id}>{other.project.name}</option>)}
                </select>
              </li>)}
            </ul>}
          {card.links.length > CARD_LINK_LIMIT && <button type="button" className="mt-1 self-start rounded-lg px-2 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"
            aria-expanded={isOpen} onClick={() => toggle(card.project.id)}>
            {isOpen ? 'Show fewer' : `Show ${card.links.length - CARD_LINK_LIMIT} more`}
          </button>}
          {card.links.length > 0 && <div className="mt-auto pt-3">
            {confirming === card.project.id
              ? <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-700">Open {card.links.length} {card.links.length === 1 ? 'tab' : 'tabs'}?</span>
                <button type="button" className={buttonClass('primary')} onClick={() => void restoreAll(card)}>Open all</button>
                <button type="button" className={buttonClass('secondary')} onClick={() => setConfirming(undefined)}>Cancel</button>
              </div>
              : <button type="button" className={buttonClass('secondary')} disabled={busy !== undefined} onClick={() => setConfirming(card.project.id)}>
                Restore all
              </button>}
          </div>}
        </section>;
      })}
    </div>}
  </div>;
}
