import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { buildLibrary, filterLibrary, moveInLibrary, type LibraryCard, type LibraryLink } from '@/domain/library';
import type { RestoreMode, SavedLink } from '@/domain/schemas';
import {
  createProject, deleteProject, getParkedSessionGroups, getProjects, getSettings, moveLink, removeLink, renameProject, restoreLink, restoreProject,
} from '@/messaging/contracts';
import { describeCollectionRestore, describeLinkRestore } from '../restore-feedback';
import { LinkFavicon } from './SavedLinkCard';
import { MoveLinkDialog } from './MoveLinkDialog';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { Icon } from './ui/Icon';
import { Menu } from './ui/Menu';
import { SectionHeader } from './ui/SectionHeader';
import { buttonClass } from './ui/styles';

/** Links shown on a card before "Show more", so a large project does not push the others off the page. */
const CARD_LINK_LIMIT = 8;
const DRAG_TYPE = 'application/x-linkshelf-link';
const PROJECT_NAME_MAX = 60;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

type CardMode = { projectId: string; kind: 'rename' | 'delete' | 'restore' };

/** A board of project cards. Drag a link onto another card to move it, or use its menu. */
export function LibrarySection() {
  const heading = useRef<HTMLHeadingElement>(null);
  const [cards, setCards] = useState<LibraryCard[]>();
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('normal');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<CardMode>();
  const [draftName, setDraftName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string>();
  const [moveCandidate, setMoveCandidate] = useState<SavedLink>();
  const [moveTarget, setMoveTarget] = useState('');
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
  const filtering = query.trim().length > 0;
  const visible = useMemo(() => {
    const filtered = filterLibrary(cards ?? [], query);
    // While filtering, cards with no matching links step aside.
    return filtering ? filtered.filter(card => card.links.length > 0) : filtered;
  }, [cards, query, filtering]);
  const matches = visible.reduce((sum, card) => sum + card.links.length, 0);

  /** Runs one worker action, reports its outcome, and reloads the board. */
  async function act(key: string, action: () => Promise<string>) {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      setStatus(await action());
      await load();
    } catch (caught) {
      setStatus('');
      setError(caught instanceof Error ? caught.message : 'LinkShelf could not finish that.');
    } finally { setBusy(undefined); }
  }

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

  const open = (entry: LibraryLink) => act(entry.link.id, async () => describeLinkRestore(await restoreLink(entry.link.id)));
  const remove = (entry: LibraryLink) => act(entry.link.id, async () => {
    const response = await removeLink(entry.link.id);
    if (!response.success) throw new Error(response.error.message);
    return `Moved “${entry.link.title}” to the Bin.`;
  });

  function startMode(card: LibraryCard, kind: CardMode['kind']) {
    setMode({ projectId: card.project.id, kind });
    setDraftName(card.project.name);
  }

  function saveRename(event: FormEvent, card: LibraryCard) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name || name === card.project.name) { setMode(undefined); return; }
    void act(card.project.id, async () => {
      const response = await renameProject(card.project.id, name);
      if (!response.success) throw new Error(response.error.message);
      setMode(undefined);
      return `Renamed the project to ${response.project.name}.`;
    });
  }

  function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    void act('new', async () => {
      const response = await createProject(name);
      if (!response.success) throw new Error(response.error.message);
      setCreating(false);
      setNewName('');
      return `Created ${response.project.name}.`;
    });
  }

  const deleteCard = (card: LibraryCard) => act(card.project.id, async () => {
    const response = await deleteProject(card.project.id);
    if (!response.success) throw new Error(response.error.message);
    setMode(undefined);
    return card.links.length
      ? `Deleted ${card.project.name}. Its ${plural(card.links.length, 'link')} moved to the Inbox.`
      : `Deleted ${card.project.name}.`;
  });

  const restoreAll = (card: LibraryCard) => act(card.project.id, async () => {
    setMode(undefined);
    return describeCollectionRestore(await restoreProject(card.project.id, restoreMode));
  });

  function toggle(projectId: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (!next.delete(projectId)) next.add(projectId);
      return next;
    });
  }

  function startMoving(link: SavedLink) {
    setMoveCandidate(link);
    setMoveTarget(cards?.find(card => card.project.id !== link.projectId)?.project.id ?? '');
  }

  const total = cards?.reduce((sum, card) => sum + card.links.length, 0) ?? 0;

  return <div>
    <SectionHeader headingRef={heading} title="Library"
      description="Every project and the links waiting in it. Drag a link onto another project to move it."
      action={<button type="button" className={buttonClass('primary')} disabled={creating} onClick={() => setCreating(true)}>New project</button>} />
    {creating && <form className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3" onSubmit={create}>
      <label className="min-w-0 flex-1 basis-60 text-sm font-semibold text-slate-800">Project name
        <input autoFocus type="text" maxLength={PROJECT_NAME_MAX} value={newName} disabled={busy === 'new'}
          className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm font-normal" onChange={event => setNewName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') { setCreating(false); setNewName(''); } }} />
      </label>
      <button type="submit" className={buttonClass('primary')} disabled={!newName.trim() || busy === 'new'}>Create project</button>
      <button type="button" className={buttonClass('ghost')} onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
    </form>}
    {cards && total > 0 && <div className="mb-3 flex flex-wrap items-center gap-3">
      <label className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
        <span className="sr-only">Filter links</span>
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
        <input type="search" value={query} placeholder="Filter by title, site, session, or tag"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm" onChange={event => setQuery(event.target.value)} />
      </label>
      {filtering && <span className="text-sm text-slate-700">{matches ? `${plural(matches, 'link')} match` : 'No links match'}</span>}
    </div>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <p role="status" className="mb-3 min-h-5 text-sm text-slate-700">{status}</p>
    {moveCandidate && <MoveLinkDialog link={moveCandidate} projects={(cards ?? []).map(card => card.project).filter(project => project.id !== moveCandidate.projectId)}
      selectedProjectId={moveTarget} isMoving={false} feedback={null} returnFocus={invoker => invoker ?? heading.current}
      onSelect={setMoveTarget} onCancel={() => setMoveCandidate(undefined)}
      onConfirm={() => { const link = moveCandidate; setMoveCandidate(undefined); void move(link.id, moveTarget); }} />}
    {!cards && !error && <SkeletonCards count={3} />}
    {cards && total === 0 && cards.length <= 1 && <EmptyState title="Nothing parked yet">Park some tabs from the sidebar and they will be laid out here by project.</EmptyState>}
    {cards && (total > 0 || cards.length > 1) && <div className="gap-4 [column-width:19rem]">
      {visible.map(card => {
        const isOpen = expanded.has(card.project.id) || filtering;
        const shown = isOpen ? card.links : card.links.slice(0, CARD_LINK_LIMIT);
        const targeted = over === card.project.id && dragging !== undefined;
        const cardMode = mode?.projectId === card.project.id ? mode.kind : undefined;
        const fullCount = cards.find(full => full.project.id === card.project.id)?.links.length ?? card.links.length;
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
          {cardMode === 'rename'
            ? <form className="flex flex-wrap items-center gap-2" onSubmit={event => saveRename(event, card)}>
              <h3 id={`lib-${card.project.id}`} className="sr-only">{card.project.name}</h3>
              <label className="sr-only" htmlFor={`rename-${card.project.id}`}>Project name</label>
              <input id={`rename-${card.project.id}`} autoFocus type="text" maxLength={PROJECT_NAME_MAX} value={draftName}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 text-sm" onChange={event => setDraftName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Escape') setMode(undefined); }} />
              <button type="submit" className={buttonClass('primary')} disabled={!draftName.trim() || busy !== undefined}>Save</button>
              <button type="button" className={buttonClass('ghost')} onClick={() => setMode(undefined)}>Cancel</button>
            </form>
            : <div className="flex items-center justify-between gap-2">
              <h3 id={`lib-${card.project.id}`} className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
                <Icon name="folder" className="size-4 shrink-0 text-blue-700" /><span className="truncate" dir="auto">{card.project.name}</span>
              </h3>
              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{card.links.length}</span>
                <Menu label={`${card.project.name} actions`} items={[
                  fullCount > 0 && { label: `Restore all (${fullCount})`, onSelect: () => startMode(card, 'restore'), disabled: busy !== undefined },
                  !card.project.isInbox && { label: 'Rename project', onSelect: () => startMode(card, 'rename') },
                  !card.project.isInbox && { label: 'Delete project', danger: true, onSelect: () => startMode(card, 'delete') },
                ]} />
              </div>
            </div>}
          {cardMode === 'restore' && <div role="group" aria-label={`Restore all of ${card.project.name}`} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 p-2 text-sm">
            <span className="text-slate-800">Open {plural(fullCount, 'tab')}?</span>
            <button type="button" className={buttonClass('primary')} disabled={busy !== undefined} onClick={() => void restoreAll(card)}>Open all</button>
            <button type="button" className={buttonClass('ghost')} onClick={() => setMode(undefined)}>Cancel</button>
          </div>}
          {cardMode === 'delete' && <div role="group" aria-label={`Delete ${card.project.name}`} className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm">
            <p className="text-red-900">Delete {card.project.name}?{fullCount ? ` Its ${plural(fullCount, 'link')} will move to the Inbox.` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={buttonClass('danger')} disabled={busy !== undefined} onClick={() => void deleteCard(card)}>Delete project</button>
              <button type="button" className={buttonClass('ghost')} onClick={() => setMode(undefined)}>Cancel</button>
            </div>
          </div>}
          {card.links.length === 0
            ? <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">Empty. Drop a link here.</p>
            : <ul className="mt-2 divide-y divide-slate-100">
              {shown.map(entry => <li key={entry.link.id} draggable={busy === undefined}
                className={`group flex items-center gap-2 py-1.5 ${dragging === entry.link.id ? 'opacity-40' : ''}`}
                onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, entry.link.id); event.dataTransfer.effectAllowed = 'move'; setDragging(entry.link.id); }}
                onDragEnd={() => { setDragging(undefined); setOver(undefined); }}>
                <LinkFavicon link={entry.link} />
                <div className="min-w-0 flex-1">
                  <button type="button" className="block w-full truncate text-left text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline disabled:opacity-50"
                    disabled={busy !== undefined} title={entry.link.url} dir="auto" onClick={() => void open(entry)}>
                    {entry.link.title}
                  </button>
                  <span className="block truncate text-xs text-slate-600">{entry.link.domain}{entry.sessionName ? ` · ${entry.sessionName}` : ''}</span>
                </div>
                <Menu label={`Actions for ${entry.link.title}`} items={[
                  { label: 'Open', onSelect: () => void open(entry), disabled: busy !== undefined },
                  cards.length > 1 && { label: 'Move to…', onSelect: () => startMoving(entry.link) },
                  { label: 'Move to the Bin', danger: true, onSelect: () => void remove(entry), disabled: busy !== undefined },
                ]} />
              </li>)}
            </ul>}
          {!filtering && card.links.length > CARD_LINK_LIMIT && <button type="button" className="mt-1 self-start rounded-lg px-2 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"
            aria-expanded={isOpen} onClick={() => toggle(card.project.id)}>
            {isOpen ? 'Show fewer' : `Show ${card.links.length - CARD_LINK_LIMIT} more`}
          </button>}
        </section>;
      })}
    </div>}
    {cards && filtering && matches === 0 && <EmptyState title="No links match">Try another word, or clear the filter to see every project.</EmptyState>}
  </div>;
}
