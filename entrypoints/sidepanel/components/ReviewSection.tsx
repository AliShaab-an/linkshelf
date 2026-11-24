import { describeLinkRestore } from '../restore-feedback';
import { SectionHeader } from './ui/SectionHeader';
import { OperationFeedback } from './ui/OperationFeedback';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Project, SavedLink } from '@/domain/schemas';
import {
  archiveLink,
  bookmarkLink,
  getBookmarkFolders,
  getParkedLinks,
  getProjects,
  moveLink,
  openBookmark,
  removeLink,
  restoreLink,
  type BookmarkFolderOption,
  type NativeBookmarkResult,
} from '@/messaging/contracts';
import { BookmarkLinkDialog } from './BookmarkLinkDialog';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { TagLinkDialog } from './TagLinkDialog';
import { MoveLinkDialog } from './MoveLinkDialog';
import { SavedLinkCard } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { Dropdown } from './ui/Dropdown';
import { buttonClass } from './ui/styles';

const ALL_PROJECTS = '*';
const plural = (count: number) => `${count} ${count === 1 ? 'link' : 'links'}`;

export function ReviewSection() {
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);
  const [moveCandidate, setMoveCandidate] = useState<SavedLink | null>(null);
  const [tagCandidate, setTagCandidate] = useState<SavedLink | null>(null);
  const [moveProjectId, setMoveProjectId] = useState('');
  const [bookmarkCandidate, setBookmarkCandidate] = useState<SavedLink | null>(null);
  const [folders, setFolders] = useState<BookmarkFolderOption[]>([]);
  const bookmarkFolderRequest = useRef(0);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [duplicate, setDuplicate] = useState<NativeBookmarkResult>();
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkRemove, setConfirmingBulkRemove] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  // After a row leaves the queue, keyboard focus moves to the row that took its place.
  const focusAfterChange = useRef<number | null>(null);
  const removedIndex = useRef(-1);

  const projectsWithLinks = useMemo(() => projects.filter(project => links.some(link => link.projectId === project.id)), [projects, links]);
  // A filtered project that has just been cleared falls back to all projects instead of showing nothing.
  const activeFilter = projectsWithLinks.some(project => project.id === projectFilter) ? projectFilter : ALL_PROJECTS;
  const shown = useMemo(() => activeFilter === ALL_PROJECTS ? links : links.filter(link => link.projectId === activeFilter), [links, activeFilter]);
  const selectedShown = shown.filter(link => selected.has(link.id));

  useLayoutEffect(() => {
    const index = focusAfterChange.current;
    if (index === null) return;
    focusAfterChange.current = null;
    const rows = list.current?.querySelectorAll<HTMLElement>('[data-link-row]');
    if (rows?.length) rows[Math.min(index, rows.length - 1)].focus();
    else sectionHeading.current?.focus();
  }, [shown]);

  useEffect(() => {
    void Promise.all([getParkedLinks(), getProjects()])
      .then(([linksResponse, projectsResponse]) => {
        if (!linksResponse.success) throw new Error(linksResponse.error.message);
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        setLinks([...linksResponse.links].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        setProjects(projectsResponse.projects);
      })
      .catch((caughtError) => setError(toMessage(caughtError, 'LinkShelf could not load the review queue.')))
      .finally(() => setIsLoading(false));
  }, []);

  function finishTagging(updated: SavedLink) {
    setLinks((current) => current.map((link) => link.id === updated.id ? updated : link));
    setTagCandidate(null);
    setError(null);
    setMessage(updated.tags?.length ? `Saved tags for “${updated.title}”.` : `Removed tags from “${updated.title}”.`);
  }

  function finish(link: SavedLink, successMessage: string) {
    const row = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-link-row]') : null;
    if (row?.dataset.linkRow === link.id) focusAfterChange.current = shown.findIndex(candidate => candidate.id === link.id);
    setLinks((current) => current.filter((candidate) => candidate.id !== link.id));
    setSelected((current) => { const next = new Set(current); next.delete(link.id); return next; });
    setMessage(successMessage);
  }

  async function runLinkAction(
    link: SavedLink,
    action: () => Promise<{ success: true; warnings?: string[] } | { success: false; error: { message: string }; warnings?: string[] }>,
    successMessage: string,
  ) {
    setWarnings([]);
    setWorkingId(link.id); setError(null); setMessage(null);
    try {
      const response = await action();
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      finish(link, successMessage);
      return true;
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not update this link.'));
      return false;
    } finally { setWorkingId(null); }
  }

  async function restoreReviewLink(link: SavedLink) {
    setWarnings([]);
    setWorkingId(link.id); setError(null); setMessage(null);
    try {
      const response = await restoreLink(link.id);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(describeLinkRestore(response));
      if (response.restored) {
        finish(link, describeLinkRestore(response));
      } else {
        setMessage(describeLinkRestore(response));
      }
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not restore this link.'));
    } finally { setWorkingId(null); }
  }

  function startRemoving(link: SavedLink) {
    removedIndex.current = shown.findIndex(candidate => candidate.id === link.id);
    setMessage(null);
    setError(null);
    setWarnings([]);
    setRemoveCandidate(link);
  }

  async function confirmRemove() {
    if (dialogPending || !removeCandidate) return;
    const link = removeCandidate;
    setDialogPending(true);
    try {
      const removed = await runLinkAction(link, () => removeLink(link.id), `Removed “${link.title}” from LinkShelf.`);
      if (removed) setRemoveCandidate(null);
    } finally {
      setDialogPending(false);
    }
  }

  function closeBookmark() {
    bookmarkFolderRequest.current++;
    setIsLoadingFolders(false);
    setBookmarkCandidate(null);
    setError(null);
  }

  async function startBookmarking(link: SavedLink) {
    const request = ++bookmarkFolderRequest.current;
    setWarnings([]);
    setMessage(null);
    setSelectedFolderId('');
    setBookmarkCandidate(link); setDuplicate(undefined); setIsLoadingFolders(true); setError(null);
    try {
      const response = await getBookmarkFolders();
      if (request !== bookmarkFolderRequest.current) return;
      if (!response.success) throw new Error(response.error.message);
      setFolders(response.folders);
      setSelectedFolderId(response.folders[0]?.id ?? '');
    } catch (caughtError) {
      if (request === bookmarkFolderRequest.current) {
        setError(toMessage(caughtError, 'LinkShelf could not load bookmark folders.'));
      }
    } finally {
      if (request === bookmarkFolderRequest.current) setIsLoadingFolders(false);
    }
  }

  function startMoving(link: SavedLink) {
    setWarnings([]);
    setMessage(null);
    const destinations = projects.filter((project) => project.id !== link.projectId);
    setMoveCandidate(link);
    setMoveProjectId(destinations[0]?.id ?? '');
    setError(destinations.length === 0 ? 'Create another project before moving this link.' : null);
  }

  async function confirmMove() {
    if (dialogPending || !moveCandidate || !moveProjectId) return;
    const link = moveCandidate;
    setWarnings([]);
    setDialogPending(true);
    setWorkingId(link.id); setError(null); setMessage(null);
    try {
      const response = await moveLink(link.id, moveProjectId);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      setLinks((current) => current.map((candidate) => candidate.id === link.id ? response.link : candidate));
      setMoveCandidate(null);
      setMessage(`Moved “${link.title}” to ${projects.find((project) => project.id === moveProjectId)?.name ?? 'its new project'}.`);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not move this link.'));
    } finally { setWorkingId(null); setDialogPending(false); }
  }

  async function confirmBookmark() {
    if (dialogPending || !bookmarkCandidate || !selectedFolderId) return;
    const link = bookmarkCandidate;
    setWarnings([]);
    setDialogPending(true);
    setMessage(null);
    setWorkingId(link.id); setError(null);
    try {
      const response = await bookmarkLink(link.id, selectedFolderId);
      setWarnings(response.warnings ?? []);
      if (!response.success) {
        if (response.error.code === 'DUPLICATE_BOOKMARK' && response.duplicates?.[0]) {
          setDuplicate(response.duplicates[0]);
          return;
        }
        if (response.bookmarkCreated) setBookmarkCandidate(null);
        throw new Error(response.error.message);
      }
      setBookmarkCandidate(null);
      finish(link, `Saved “${link.title}” as a Chrome bookmark.`);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not create the bookmark.'));
    } finally { setWorkingId(null); setDialogPending(false); }
  }

  async function openDuplicate() {
    if (dialogPending || !duplicate || !bookmarkCandidate || workingId) return;
    setWorkingId(bookmarkCandidate.id);
    setMessage(null);
    setError(null);
    setWarnings([]);
    setDialogPending(true);
    try {
      const response = await openBookmark(duplicate.url);
      if (!response.success) throw new Error(response.error.message);
      setMessage('Opened the existing Chrome bookmark.');
    } catch (caughtError) {
      setError(toMessage(caughtError, 'Chrome could not open this bookmark.'));
    } finally {
      setWorkingId(null);
      setDialogPending(false);
    }
  }

  /** After the remove dialog: back to the invoking control if it is still there, else to the link that took the removed one's place. */
  function returnFromRemove(invoker: HTMLElement | null) {
    if (invoker?.isConnected) return invoker;
    const rows = list.current?.querySelectorAll<HTMLElement>('[data-link-row]:not([data-link-row="' + (removeCandidate?.id ?? '') + '"])');
    return rows?.length ? rows[Math.min(Math.max(removedIndex.current, 0), rows.length - 1)] : sectionHeading.current;
  }

  function toggle(linkId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(linkId); else next.delete(linkId);
      return next;
    });
  }

  /** Runs one action over every selected link in turn and reports how many it managed. */
  async function runBulk(verb: string, action: (linkId: string) => Promise<{ success: boolean; error?: { message: string } }>) {
    const targets = selectedShown;
    if (bulkWorking || targets.length === 0) return;
    setBulkWorking(true); setConfirmingBulkRemove(false);
    setError(null); setMessage(null); setWarnings([]);
    const done = new Set<string>();
    let failure: string | undefined;
    for (const link of targets) {
      try {
        const response = await action(link.id);
        if (response.success) done.add(link.id);
        else failure ??= response.error?.message;
      } catch (caught) {
        failure ??= toMessage(caught, 'LinkShelf could not update a link.');
      }
    }
    setLinks((current) => current.filter((link) => !done.has(link.id)));
    setSelected((current) => new Set([...current].filter((id) => !done.has(id))));
    if (done.size === targets.length) setMessage(`${verb} ${plural(done.size)}.`);
    else setError(`${verb} ${done.size} of ${plural(targets.length)}. ${failure ?? ''}`.trim());
    setBulkWorking(false);
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement) || event.altKey || event.ctrlKey || event.metaKey) return;
    const row = event.target.closest<HTMLElement>('[data-link-row]');
    // Shortcuts act on a focused row, not while a button or checkbox inside it has focus.
    if (!row || row !== event.target || workingId || bulkWorking) return;
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-link-row]') ?? [])];
    const index = rows.indexOf(row);
    const link = shown.find((candidate) => candidate.id === row.dataset.linkRow);
    if (!link) return;
    const key = event.key.toLowerCase();
    const run = (callback: () => void) => { event.preventDefault(); callback(); };
    if (key === 'arrowdown' || key === 'j') run(() => rows[index + 1]?.focus());
    else if (key === 'arrowup' || key === 'k') run(() => rows[index - 1]?.focus());
    else if (key === 'enter' || key === 'o') run(() => void restoreReviewLink(link));
    else if (key === 'a') run(() => void runLinkAction(link, () => archiveLink(link.id), `Archived “${link.title}”.`));
    else if (key === 'delete' || key === 'backspace') run(() => startRemoving(link));
    else if (key === 'x' || key === ' ') run(() => toggle(link.id, !selected.has(link.id)));
  }

  const feedback = { pending: isLoadingFolders ? 'Loading bookmark folders…' : bulkWorking ? 'Updating selected links…' : workingId ? 'Updating link…' : undefined, message, error: error, warnings };
  const dialogFeedback = <OperationFeedback {...feedback}
    pending={isLoadingFolders ? 'Loading bookmark folders…' : dialogPending ? 'Updating link…' : undefined} />;

  return (
    <>
      <OperationFeedback {...(!(removeCandidate || moveCandidate || bookmarkCandidate || tagCandidate) ? feedback : {})} />
      <SectionHeader headingRef={sectionHeading} title="Review"
        description={isLoading ? undefined : `${links.length} ${links.length === 1 ? 'link' : 'links'} to review`} />
      {bookmarkCandidate ? <div className="mb-4"><BookmarkLinkDialog feedback={dialogFeedback} returnFocus={(invoker) => invoker ?? sectionHeading.current} link={bookmarkCandidate} folders={folders} selectedFolderId={selectedFolderId} duplicate={duplicate} isLoadingFolders={isLoadingFolders} isSaving={dialogPending} onSelectFolder={setSelectedFolderId} onCancel={closeBookmark} onConfirm={() => void confirmBookmark()} onOpenDuplicate={() => void openDuplicate()} /></div> : moveCandidate ? <div className="mb-4"><MoveLinkDialog feedback={dialogFeedback} returnFocus={(invoker) => invoker ?? sectionHeading.current} link={moveCandidate} projects={projects.filter((project) => project.id !== moveCandidate.projectId)} selectedProjectId={moveProjectId} isMoving={dialogPending} onSelect={setMoveProjectId} onCancel={() => setMoveCandidate(null)} onConfirm={() => void confirmMove()} /></div> : removeCandidate ? <div className="mb-4"><RemoveLinkDialog feedback={dialogFeedback} returnFocus={returnFromRemove} link={removeCandidate} isRemoving={dialogPending} onCancel={() => setRemoveCandidate(null)} onConfirm={() => void confirmRemove()} /></div> : null}
      {tagCandidate && <TagLinkDialog link={tagCandidate} suggestions={[...new Set(links.flatMap((link) => link.tags ?? []))]} returnFocus={(invoker) => invoker ?? sectionHeading.current} onSaved={finishTagging} onCancel={() => setTagCandidate(null)} />}
      {isLoading && <SkeletonCards />}
      {!isLoading && !error && links.length === 0 && <EmptyState title="Review queue is clear">Parked links will appear here when they need a decision.</EmptyState>}
      {!isLoading && links.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" className="size-4 accent-blue-700" disabled={bulkWorking || shown.length === 0}
            checked={shown.length > 0 && selectedShown.length === shown.length}
            ref={(element) => { if (element) element.indeterminate = selectedShown.length > 0 && selectedShown.length < shown.length; }}
            onChange={(event) => setSelected(event.target.checked ? new Set(shown.map((link) => link.id)) : new Set())} />
          {selectedShown.length ? `${selectedShown.length} selected` : 'Select all'}
        </label>
        {selectedShown.length > 0 && !confirmingBulkRemove && <>
          <button type="button" className={buttonClass('secondary')} disabled={bulkWorking} onClick={() => void runBulk('Archived', archiveLink)}>Archive selected</button>
          <button type="button" className={buttonClass('danger-outline')} disabled={bulkWorking} onClick={() => setConfirmingBulkRemove(true)}>Remove selected</button>
        </>}
        {confirmingBulkRemove && <div role="group" aria-label="Remove selected links" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-800">Move {plural(selectedShown.length)} to the Bin? You can recover them for 30 days.</span>
          <button type="button" className={buttonClass('danger')} disabled={bulkWorking} onClick={() => void runBulk('Removed', removeLink)}>Remove</button>
          <button type="button" className={buttonClass('ghost')} disabled={bulkWorking} onClick={() => setConfirmingBulkRemove(false)}>Cancel</button>
        </div>}
        {projectsWithLinks.length > 1 && <div className="ml-auto flex items-center gap-2">
          <span id="review-project-filter" className="text-sm text-slate-700">Project</span>
          <Dropdown aria-labelledby="review-project-filter" className="min-w-40" value={activeFilter}
            options={[{ value: ALL_PROJECTS, label: 'All projects' }, ...projectsWithLinks.map((project) => ({ value: project.id, label: project.name }))]}
            onChange={(value) => { setProjectFilter(value); setSelected(new Set()); setConfirmingBulkRemove(false); }} />
        </div>}
      </div>}
      {!isLoading && links.length > 0 && <p id="review-shortcuts" className="mb-2 hidden text-xs text-slate-600 sm:block">
        Keyboard: ↑ ↓ move between links · Enter restore · A archive · Delete remove · X select
      </p>}
      <div ref={list} className="space-y-2" aria-describedby={links.length ? 'review-shortcuts' : undefined} onKeyDown={onListKeyDown}>
        {shown.map((link) => <SavedLinkCard key={link.id} layout="row" selected={selected.has(link.id)} onSelectChange={(checked) => toggle(link.id, checked)} link={link} projectName={projects.find((project) => project.id === link.projectId)?.name} isRestoring={workingId === link.id} onRestore={() => void restoreReviewLink(link)} onBookmark={() => void startBookmarking(link)} onEditTags={() => { setMessage(null); setError(null); setWarnings([]); setTagCandidate(link); }} onMove={() => startMoving(link)} onArchive={() => void runLinkAction(link, () => archiveLink(link.id), `Archived “${link.title}”.`)} onRemove={() => startRemoving(link)} />)}
      </div>
    </>
  );
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
