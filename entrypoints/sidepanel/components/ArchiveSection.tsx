import { OperationWarnings } from '@/entrypoints/sidepanel/components/ui/OperationWarnings';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, SavedLink } from '@/domain/schemas';
import {
  getArchivedLinks,
  getProjects,
  removeLink,
  unarchiveLink,
} from '@/messaging/contracts';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { SavedLinkCard } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { ListNavigation } from './ui/ListNavigation';
import { listRange, LIST_PAGE_SIZE } from '../list-range';

export function ArchiveSection() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);
  const [page, setPage] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const range = listRange(links.length, page);
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects]);

  function focusBeforeRemoval(linkId: string) {
    const active = document.activeElement;
    if (active?.closest('[role="dialog"]') ||
        (cards.current?.contains(active) && active?.closest('article')?.id === `archived-${linkId}`)) {
      heading.current?.focus();
    }
  }

  useEffect(() => {
    let version = 0;
    let timeout: ReturnType<typeof setTimeout>;
    async function load(request: number) {
      try {
        const [linksResponse, projectsResponse] = await Promise.all([getArchivedLinks(), getProjects()]);
        if (request !== version) return;
        if (!linksResponse.success) throw new Error(linksResponse.error.message);
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        if (linksResponse.links.length <= LIST_PAGE_SIZE && document.activeElement?.closest('nav')?.getAttribute('aria-label') === 'Archived links pages') {
          heading.current?.focus();
        }
        const activeCard = document.activeElement?.closest('article');
        if (activeCard && cards.current?.contains(activeCard)) {
          const selected = Number(cards.current.dataset.page);
          const nextRange = listRange(linksResponse.links.length, selected);
          const remains = linksResponse.links.slice(nextRange.start, nextRange.end)
            .some(link => activeCard.id === `archived-${link.id}`);
          if (!remains) heading.current?.focus();
        }
        setLinks(linksResponse.links);
        setPage(current => listRange(linksResponse.links.length, current).page);
        setProjects(projectsResponse.projects);
        setLoadError(null);
      } catch (caughtError) {
        if (request === version) setLoadError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load the archive.');
      } finally {
        if (request === version) { setIsLoading(false); setIsRefreshing(false); }
      }
    }
    const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !Object.hasOwn(changes, 'linkshelfDatabase')) return;
      const request = ++version;
      setIsRefreshing(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => void load(request), 100);
    };
    browser.storage.onChanged.addListener(changed);
    void load(version);
    return () => {
      version++;
      clearTimeout(timeout);
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);

  async function returnToProject(link: SavedLink) {
    if (isRefreshing) return;
    const hadFocus = document.activeElement?.closest('article')?.id === `archived-${link.id}`;
    setWorkingId(link.id);
    setError(null);
    try {
      const response = await unarchiveLink(link.id);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      focusBeforeRemoval(link.id);
      if (hadFocus && document.activeElement === document.body) heading.current?.focus();
      setLinks((current) => current.filter((candidate) => candidate.id !== link.id));
      setMessage(`Returned “${link.title}” to its project.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not unarchive this link.');
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmRemove() {
    if (!removeCandidate || isRefreshing) return;
    const link = removeCandidate;
    if (!links.some(candidate => candidate.id === link.id)) {
      focusBeforeRemoval(link.id);
      setRemoveCandidate(null);
      setError('This link is no longer in the archive.');
      return;
    }
    const hadFocus = !!document.activeElement?.closest('[role="dialog"]');
    setWorkingId(link.id);
    setError(null);
    try {
      const response = await removeLink(link.id);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      focusBeforeRemoval(link.id);
      if (hadFocus && document.activeElement === document.body) heading.current?.focus();
      setLinks((current) => current.filter((candidate) => candidate.id !== link.id));
      setRemoveCandidate(null);
      setMessage(`Removed “${link.title}” from LinkShelf.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not remove this link.');
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      <OperationWarnings warnings={warnings} />
      <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inactive links</p><h2 ref={heading} tabIndex={-1} className="mt-1 text-lg font-bold">Archive</h2><p className="mt-1 text-sm text-slate-500">Archived links stay local and searchable without cluttering active projects.</p></div>
      {removeCandidate && <RemoveLinkDialog link={removeCandidate} isRemoving={workingId === removeCandidate.id} onCancel={() => setRemoveCandidate(null)} onConfirm={() => void confirmRemove()} />}
      {message && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {(error || loadError) && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error || loadError}</p>}
      {isLoading && <SkeletonCards count={2} />}
      {!isLoading && !error && !loadError && links.length === 0 && <EmptyState title="Archive is empty">Links you archive remain searchable and will appear here.</EmptyState>}
      <ListNavigation label="Archived links pages" range={range} count={links.length} onPage={setPage} />
      <div ref={cards} data-page={range.page} className="space-y-3">
        {links.slice(range.start, range.end).map((link) => <SavedLinkCard key={link.id} cardId={`archived-${link.id}`} link={link} projectName={projectNames.get(link.projectId)} isRestoring={workingId === link.id} onUnarchive={() => void returnToProject(link)} onRemove={() => { if (!isRefreshing) setRemoveCandidate(link); }} />)}
      </div>
    </>
  );
}
