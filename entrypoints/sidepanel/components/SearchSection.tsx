import { useEffect, useRef, useState } from 'react';
import type { SavedLink } from '@/domain/schemas';
import {
  archiveLink,
  bookmarkLink,
  getBookmarkFolders,
  openBookmark,
  removeLink,
  restoreLink,
  searchLinks,
  unarchiveLink,
  type BookmarkFolderOption,
  type LinkSearchResult,
  type NativeBookmarkResult,
} from '@/messaging/contracts';
import { BookmarkLinkDialog } from './BookmarkLinkDialog';
import { NativeBookmarkCard } from './NativeBookmarkCard';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { SavedLinkCard } from './SavedLinkCard';

export function SearchSection({ focusRequestId }: { focusRequestId?: string }) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkSearchResult[]>([]);
  const [bookmarks, setBookmarks] = useState<NativeBookmarkResult[]>([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);
  const [bookmarkCandidate, setBookmarkCandidate] = useState<SavedLink | null>(null);
  const [bookmarkFolders, setBookmarkFolders] = useState<BookmarkFolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [duplicate, setDuplicate] = useState<NativeBookmarkResult | undefined>();

  useEffect(() => {
    if (focusRequestId) searchInputRef.current?.focus();
  }, [focusRequestId]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults([]); setBookmarks([]); setError(null); setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true); setError(null);
    const timeoutId = window.setTimeout(() => {
      void searchLinks(normalizedQuery)
        .then((response) => {
          if (cancelled) return;
          if (!response.success) throw new Error(response.error.message);
          setResults(response.results);
          setBookmarks(response.bookmarks);
        })
        .catch((caughtError) => {
          if (!cancelled) setError(errorMessage(caughtError, 'LinkShelf could not search saved links.'));
        })
        .finally(() => { if (!cancelled) setIsSearching(false); });
    }, 150);

    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [query, refreshVersion]);

  function replaceResult(link: SavedLink) {
    setResults((current) => current.map((result) =>
      result.link.id === link.id ? { ...result, link } : result,
    ));
  }

  function removeResult(linkId: string) {
    setResults((current) => current.filter((result) => result.link.id !== linkId));
  }

  async function runAction(link: SavedLink, action: () => ReturnType<typeof archiveLink>, successMessage: string) {
    setWorkingId(link.id); setError(null); setMessage(null);
    try {
      const response = await action();
      if (!response.success) throw new Error(response.error.message);
      replaceResult(response.link); setMessage(successMessage);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'LinkShelf could not update this link.'));
    } finally { setWorkingId(null); }
  }

  async function handleRestore(link: SavedLink) {
    setWorkingId(link.id); setError(null);
    try {
      const response = await restoreLink(link.id);
      if (!response.success) throw new Error(response.error.message);
      if (response.restored) removeResult(link.id);
      setMessage(response.restored ? `Restored “${link.title}”.` : `Opened a copy of “${link.title}”; it remains parked.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'LinkShelf could not restore this link.'));
    } finally { setWorkingId(null); }
  }

  async function confirmRemove() {
    if (!removeCandidate) return;
    const link = removeCandidate;
    setWorkingId(link.id); setError(null);
    try {
      const response = await removeLink(link.id);
      if (!response.success) throw new Error(response.error.message);
      removeResult(link.id); setRemoveCandidate(null);
      setMessage(`Removed “${link.title}” from LinkShelf.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'LinkShelf could not remove this link.'));
    } finally { setWorkingId(null); }
  }

  async function startBookmarking(link: SavedLink) {
    setBookmarkCandidate(link); setDuplicate(undefined); setMessage(null);
    setIsLoadingFolders(true); setError(null);
    try {
      const response = await getBookmarkFolders();
      if (!response.success) throw new Error(response.error.message);
      setBookmarkFolders(response.folders);
      setSelectedFolderId(response.folders[0]?.id ?? '');
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'LinkShelf could not load bookmark folders.'));
    } finally { setIsLoadingFolders(false); }
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
        if (response.bookmarkCreated) setRefreshVersion((value) => value + 1);
        throw new Error(response.error.message);
      }
      setBookmarkCandidate(null); removeResult(link.id);
      setRefreshVersion((value) => value + 1);
      setMessage(`Saved “${link.title}” as a Chrome bookmark.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'LinkShelf could not create the bookmark.'));
    } finally { setWorkingId(null); }
  }

  async function handleOpen(bookmark: NativeBookmarkResult) {
    setWorkingId(`bookmark:${bookmark.id}`); setError(null);
    try {
      const response = await openBookmark(bookmark.url);
      if (!response.success) throw new Error(response.error.message);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Chrome could not open this bookmark.'));
    } finally { setWorkingId(null); }
  }

  const resultCount = results.length + bookmarks.length;

  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Local search</p>
        <h2 className="mt-1 text-lg font-bold">Search your shelf and bookmarks</h2>
        <p className="mt-1 text-sm text-slate-500">Search LinkShelf links and native Chrome bookmarks by title, URL, note, or project.</p>
      </div>
      <label className="sr-only" htmlFor="link-search">Search saved links</label>
      <input ref={searchInputRef} id="link-search" type="search" autoFocus className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="React docs, client project, example.com..." value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{isSearching ? 'Searching...' : query.trim() ? `${resultCount} result${resultCount === 1 ? '' : 's'}` : 'Type to search'}</span><span>Stored locally</span></div>

      {bookmarkCandidate && <div className="mt-4"><BookmarkLinkDialog link={bookmarkCandidate} folders={bookmarkFolders} selectedFolderId={selectedFolderId} duplicate={duplicate} isLoadingFolders={isLoadingFolders} isSaving={workingId === bookmarkCandidate.id} onSelectFolder={setSelectedFolderId} onCancel={() => setBookmarkCandidate(null)} onConfirm={() => void confirmBookmark()} onOpenDuplicate={() => duplicate && void handleOpen(duplicate)} /></div>}
      {removeCandidate && <div className="mt-4"><RemoveLinkDialog link={removeCandidate} isRemoving={workingId === removeCandidate.id} onCancel={() => setRemoveCandidate(null)} onConfirm={() => void confirmRemove()} /></div>}
      {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {!isSearching && query.trim() && !error && resultCount === 0 && <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center"><h3 className="font-semibold">No matching links</h3><p className="mt-1 text-sm text-slate-500">Try a title, domain, note, or project name.</p></div>}

      {results.length > 0 && <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">LinkShelf</h3>}
      <div className="mt-2 space-y-3">
        {results.map(({ link, projectName }) => <SavedLinkCard key={link.id} link={link} projectName={projectName} showStatus isRestoring={workingId === link.id} onRestore={link.status === 'parked' ? () => void handleRestore(link) : undefined} onArchive={link.status === 'parked' ? () => void runAction(link, () => archiveLink(link.id), `Archived “${link.title}”.`) : undefined} onUnarchive={link.status === 'archived' ? () => void runAction(link, () => unarchiveLink(link.id), `Returned “${link.title}” to its project.`) : undefined} onBookmark={link.status === 'parked' ? () => void startBookmarking(link) : undefined} onRemove={() => setRemoveCandidate(link)} />)}
      </div>

      {bookmarks.length > 0 && <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Chrome bookmarks</h3>}
      <div className="mt-2 space-y-3">
        {bookmarks.map((bookmark) => <NativeBookmarkCard key={bookmark.id} bookmark={bookmark} isOpening={workingId === `bookmark:${bookmark.id}`} onOpen={() => void handleOpen(bookmark)} />)}
      </div>
    </>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
