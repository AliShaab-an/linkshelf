import { describeLinkRestore } from '../restore-feedback';
import { OperationFeedback } from './ui/OperationFeedback';
import { useEffect, useRef, useState } from 'react';
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
import { MoveLinkDialog } from './MoveLinkDialog';
import { SavedLinkCard } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';

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
  const [moveProjectId, setMoveProjectId] = useState('');
  const [bookmarkCandidate, setBookmarkCandidate] = useState<SavedLink | null>(null);
  const [folders, setFolders] = useState<BookmarkFolderOption[]>([]);
  const bookmarkFolderRequest = useRef(0);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [duplicate, setDuplicate] = useState<NativeBookmarkResult>();

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

  function finish(link: SavedLink, successMessage: string) {
    setLinks((current) => current.filter((candidate) => candidate.id !== link.id));
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

  const feedback = { pending: isLoadingFolders ? 'Loading bookmark folders…' : workingId ? 'Updating link…' : undefined, message, error: error, warnings };
  const dialogFeedback = <OperationFeedback {...feedback}
    pending={isLoadingFolders ? 'Loading bookmark folders…' : dialogPending ? 'Updating link…' : undefined} />;

  return (
    <>
      <OperationFeedback {...(!(removeCandidate || moveCandidate || bookmarkCandidate) ? feedback : {})} />
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 ref={sectionHeading} tabIndex={-1} className="text-lg font-bold">Review</h2>
        {!isLoading && <p className="text-sm text-slate-600">{links.length} {links.length === 1 ? 'link' : 'links'} to review</p>}
      </div>
      {bookmarkCandidate ? <div className="mb-4"><BookmarkLinkDialog feedback={dialogFeedback} returnFocus={(invoker) => invoker ?? sectionHeading.current} link={bookmarkCandidate} folders={folders} selectedFolderId={selectedFolderId} duplicate={duplicate} isLoadingFolders={isLoadingFolders} isSaving={dialogPending} onSelectFolder={setSelectedFolderId} onCancel={closeBookmark} onConfirm={() => void confirmBookmark()} onOpenDuplicate={() => void openDuplicate()} /></div> : moveCandidate ? <div className="mb-4"><MoveLinkDialog feedback={dialogFeedback} returnFocus={(invoker) => invoker ?? sectionHeading.current} link={moveCandidate} projects={projects.filter((project) => project.id !== moveCandidate.projectId)} selectedProjectId={moveProjectId} isMoving={dialogPending} onSelect={setMoveProjectId} onCancel={() => setMoveCandidate(null)} onConfirm={() => void confirmMove()} /></div> : removeCandidate ? <div className="mb-4"><RemoveLinkDialog feedback={dialogFeedback} returnFocus={(invoker) => invoker ?? sectionHeading.current} link={removeCandidate} isRemoving={dialogPending} onCancel={() => setRemoveCandidate(null)} onConfirm={() => void confirmRemove()} /></div> : null}
      {isLoading && <SkeletonCards />}
      {!isLoading && !error && links.length === 0 && <EmptyState title="Review queue is clear">Parked links will appear here when they need a decision.</EmptyState>}
      <div className="space-y-2">
        {links.map((link) => <SavedLinkCard key={link.id} link={link} projectName={projects.find((project) => project.id === link.projectId)?.name} isRestoring={workingId === link.id} onRestore={() => void restoreReviewLink(link)} onBookmark={() => void startBookmarking(link)} onMove={() => startMoving(link)} onArchive={() => void runLinkAction(link, () => archiveLink(link.id), `Archived “${link.title}”.`)} onRemove={() => startRemoving(link)} />)}
      </div>
    </>
  );
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
