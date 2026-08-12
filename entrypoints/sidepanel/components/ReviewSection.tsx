import { useEffect, useState } from 'react';
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
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);
  const [moveCandidate, setMoveCandidate] = useState<SavedLink | null>(null);
  const [moveProjectId, setMoveProjectId] = useState('');
  const [bookmarkCandidate, setBookmarkCandidate] = useState<SavedLink | null>(null);
  const [folders, setFolders] = useState<BookmarkFolderOption[]>([]);
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
    action: () => Promise<{ success: true } | { success: false; error: { message: string } }>,
    successMessage: string,
  ) {
    setWorkingId(link.id); setError(null); setMessage(null);
    try {
      const response = await action();
      if (!response.success) throw new Error(response.error.message);
      finish(link, successMessage);
      return true;
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not update this link.'));
      return false;
    } finally { setWorkingId(null); }
  }

  async function confirmRemove() {
    if (!removeCandidate) return;
    const link = removeCandidate;
    const removed = await runLinkAction(link, () => removeLink(link.id), `Removed “${link.title}” from LinkShelf.`);
    if (removed) setRemoveCandidate(null);
  }

  async function startBookmarking(link: SavedLink) {
    setBookmarkCandidate(link); setDuplicate(undefined); setIsLoadingFolders(true); setError(null);
    try {
      const response = await getBookmarkFolders();
      if (!response.success) throw new Error(response.error.message);
      setFolders(response.folders);
      setSelectedFolderId(response.folders[0]?.id ?? '');
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not load bookmark folders.'));
    } finally { setIsLoadingFolders(false); }
  }

  function startMoving(link: SavedLink) {
    const destinations = projects.filter((project) => project.id !== link.projectId);
    setMoveCandidate(link);
    setMoveProjectId(destinations[0]?.id ?? '');
    setError(destinations.length === 0 ? 'Create another project before moving this link.' : null);
  }

  async function confirmMove() {
    if (!moveCandidate || !moveProjectId) return;
    const link = moveCandidate;
    setWorkingId(link.id); setError(null); setMessage(null);
    try {
      const response = await moveLink(link.id, moveProjectId);
      if (!response.success) throw new Error(response.error.message);
      setLinks((current) => current.map((candidate) => candidate.id === link.id ? response.link : candidate));
      setMoveCandidate(null);
      setMessage(`Moved “${link.title}” to ${projects.find((project) => project.id === moveProjectId)?.name ?? 'its new project'}.`);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not move this link.'));
    } finally { setWorkingId(null); }
  }

  async function confirmBookmark() {
    if (!bookmarkCandidate || !selectedFolderId) return;
    const link = bookmarkCandidate;
    setWorkingId(link.id); setError(null);
    try {
      const response = await bookmarkLink(link.id, selectedFolderId);
      if (!response.success) {
        if (response.error.code === 'DUPLICATE_BOOKMARK' && response.duplicates?.[0]) {
          setDuplicate(response.duplicates[0]);
          return;
        }
        throw new Error(response.error.message);
      }
      setBookmarkCandidate(null);
      finish(link, `Saved “${link.title}” as a Chrome bookmark.`);
    } catch (caughtError) {
      setError(toMessage(caughtError, 'LinkShelf could not create the bookmark.'));
    } finally { setWorkingId(null); }
  }

  async function openDuplicate() {
    if (!duplicate) return;
    const response = await openBookmark(duplicate.url);
    if (!response.success) setError(response.error.message);
  }

  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Decision queue</p>
        <h2 className="mt-1 text-lg font-bold">Review parked links</h2>
        <p className="mt-1 text-sm text-slate-500">Oldest links appear first. Restore, keep permanently, archive, or remove each one.</p>
      </div>
      {!isLoading && links.length > 0 && <p className="mb-3 rounded-xl bg-violet-50 p-3 text-sm text-violet-800"><strong>{links.length}</strong> parked link{links.length === 1 ? '' : 's'} waiting for a decision.</p>}
      {bookmarkCandidate && <div className="mb-4"><BookmarkLinkDialog link={bookmarkCandidate} folders={folders} selectedFolderId={selectedFolderId} duplicate={duplicate} isLoadingFolders={isLoadingFolders} isSaving={workingId === bookmarkCandidate.id} onSelectFolder={setSelectedFolderId} onCancel={() => setBookmarkCandidate(null)} onConfirm={() => void confirmBookmark()} onOpenDuplicate={() => void openDuplicate()} /></div>}
      {moveCandidate && <div className="mb-4"><MoveLinkDialog link={moveCandidate} projects={projects.filter((project) => project.id !== moveCandidate.projectId)} selectedProjectId={moveProjectId} isMoving={workingId === moveCandidate.id} onSelect={setMoveProjectId} onCancel={() => setMoveCandidate(null)} onConfirm={() => void confirmMove()} /></div>}
      {removeCandidate && <div className="mb-4"><RemoveLinkDialog link={removeCandidate} isRemoving={workingId === removeCandidate.id} onCancel={() => setRemoveCandidate(null)} onConfirm={() => void confirmRemove()} /></div>}
      {message && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {isLoading && <SkeletonCards />}
      {!isLoading && !error && links.length === 0 && <EmptyState title="Review queue is clear">Parked links will appear here when they need a decision.</EmptyState>}
      <div className="space-y-3">
        {links.map((link) => <SavedLinkCard key={link.id} link={link} projectName={projects.find((project) => project.id === link.projectId)?.name} isRestoring={workingId === link.id} onRestore={() => void runLinkAction(link, () => restoreLink(link.id), `Restored “${link.title}”.`)} onBookmark={() => void startBookmarking(link)} onMove={() => startMoving(link)} onArchive={() => void runLinkAction(link, () => archiveLink(link.id), `Archived “${link.title}”.`)} onRemove={() => setRemoveCandidate(link)} />)}
      </div>
    </>
  );
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
