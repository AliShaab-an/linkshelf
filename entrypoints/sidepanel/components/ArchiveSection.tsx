import { OperationFeedback } from './ui/OperationFeedback';
import { SectionHeader } from './ui/SectionHeader';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, SavedLink } from '@/domain/schemas';
import {
  getArchivedLinks,
  getProjects,
  removeLink,
  unarchiveLink,
} from '@/messaging/contracts';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { TagLinkDialog } from './TagLinkDialog';
import { SavedLinkCard } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { ListNavigation } from './ui/ListNavigation';
import { listRange, LIST_PAGE_SIZE } from '../list-range';
import { linkMatches, queryWords } from '@/domain/link-query';
import { Dropdown } from './ui/Dropdown';
import { Icon } from './ui/Icon';
import { buttonClass } from './ui/styles';

const ALL_PROJECTS = '*';
const plural = (count: number) => `${count} ${count === 1 ? 'link' : 'links'}`;

export function ArchiveSection() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);
  const [tagCandidate, setTagCandidate] = useState<SavedLink | null>(null);
  const [page, setPage] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkRemove, setConfirmingBulkRemove] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects]);
  const archivedProjects = useMemo(() => projects.filter(project => links.some(link => link.projectId === project.id)), [projects, links]);
  const activeFilter = archivedProjects.some(project => project.id === projectFilter) ? projectFilter : ALL_PROJECTS;
  const filtered = useMemo(() => {
    const words = queryWords(query);
    return links.filter(link => (activeFilter === ALL_PROJECTS || link.projectId === activeFilter) && linkMatches(link, words, [projectNames.get(link.projectId)]));
  }, [links, query, activeFilter, projectNames]);
  const filtering = filtered.length !== links.length;
  const range = listRange(filtered.length, page);
  const pageLinks = filtered.slice(range.start, range.end);
  const selectedLinks = filtered.filter(link => selected.has(link.id));

  function changeFilter(update: () => void) {
    update();
    setPage(0);
    setSelected(new Set());
    setConfirmingBulkRemove(false);
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
    const targets = selectedLinks;
    if (bulkWorking || isRefreshing || targets.length === 0) return;
    setBulkWorking(true); setConfirmingBulkRemove(false);
    setError(null); setMessage(null); setWarnings([]);
    if (cards.current?.contains(document.activeElement)) heading.current?.focus();
    const done = new Set<string>();
    let failure: string | undefined;
    for (const link of targets) {
      try {
        const response = await action(link.id);
        if (response.success) done.add(link.id);
        else failure ??= response.error?.message;
      } catch (caught) {
        failure ??= caught instanceof Error ? caught.message : 'LinkShelf could not update a link.';
      }
    }
    setLinks((current) => current.filter((link) => !done.has(link.id)));
    setSelected((current) => new Set([...current].filter((id) => !done.has(id))));
    if (done.size === targets.length) setMessage(`${verb} ${plural(done.size)}.`);
    else setError(`${verb} ${done.size} of ${plural(targets.length)}. ${failure ?? ''}`.trim());
    setBulkWorking(false);
  }

  function focusBeforeRemoval(linkId: string) {
    const active = document.activeElement;
    if (cards.current?.contains(active) && active?.closest('article')?.id === `archived-${linkId}`) {
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
    setWarnings([]);
    setMessage(null);
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

  function startRemoving(link: SavedLink) {
    setMessage(null);
    setError(null);
    setWarnings([]);
    setRemoveCandidate(link);
  }

  async function confirmRemove() {
    if (dialogPending || !removeCandidate || isRefreshing) return;
    const link = removeCandidate;
    if (!links.some(candidate => candidate.id === link.id)) {
      setRemoveCandidate(null);
      setError('This link is no longer in the archive.');
      return;
    }
    setWarnings([]);
    setDialogPending(true);
    setMessage(null);
    setWorkingId(link.id);
    setError(null);
    try {
      const response = await removeLink(link.id);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      setLinks((current) => current.filter((candidate) => candidate.id !== link.id));
      setRemoveCandidate(null);
      setMessage(`Removed “${link.title}” from LinkShelf.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not remove this link.');
    } finally {
      setWorkingId(null);
      setDialogPending(false);
    }
  }

  function finishTagging(updated: SavedLink) {
    setLinks((current) => current.map((link) => link.id === updated.id ? updated : link));
    setTagCandidate(null);
    setError(null);
    setMessage(updated.tags?.length ? `Saved tags for “${updated.title}”.` : `Removed tags from “${updated.title}”.`);
  }

  const feedback = { pending: bulkWorking ? 'Updating selected links…' : workingId ? 'Updating link…' : undefined, message, error: error || loadError, warnings };

  return (
    <>
      <OperationFeedback {...(!(removeCandidate || tagCandidate) ? feedback : {})} />
      <SectionHeader headingRef={heading} title="Archive" description="Archived links stay searchable. Use Return to project to park a link in its original project again." />
      {removeCandidate && <RemoveLinkDialog link={removeCandidate} feedback={<OperationFeedback {...feedback} pending={dialogPending ? 'Updating link…' : undefined} />} returnFocus={(invoker) => invoker ?? heading.current} isRemoving={dialogPending} onCancel={() => setRemoveCandidate(null)} onConfirm={() => void confirmRemove()} />}
      {tagCandidate && <TagLinkDialog link={tagCandidate} suggestions={[...new Set(links.flatMap((link) => link.tags ?? []))]} returnFocus={(invoker) => invoker ?? heading.current} onSaved={finishTagging} onCancel={() => setTagCandidate(null)} />}
      {isLoading && <SkeletonCards count={2} />}
      {!isLoading && !error && !loadError && links.length === 0 && <EmptyState title="Archive is empty">Links you archive remain searchable and will appear here.</EmptyState>}
      {!isLoading && links.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
          <span className="sr-only">Search the archive</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input type="search" value={query} placeholder="Search by title, site, note, or tag"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm" onChange={event => changeFilter(() => setQuery(event.target.value))} />
        </label>
        {archivedProjects.length > 1 && <div className="flex items-center gap-2">
          <span id="archive-project-filter" className="text-sm text-slate-700">Project</span>
          <Dropdown aria-labelledby="archive-project-filter" className="min-w-40" value={activeFilter}
            options={[{ value: ALL_PROJECTS, label: 'All projects' }, ...archivedProjects.map((project) => ({ value: project.id, label: project.name }))]}
            onChange={(value) => changeFilter(() => setProjectFilter(value))} />
        </div>}
        {filtering && <span className="text-sm text-slate-700">{filtered.length ? `${plural(filtered.length)} found` : 'No archived links match'}</span>}
      </div>}
      {!isLoading && pageLinks.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" className="size-4 accent-blue-700" disabled={bulkWorking}
            checked={pageLinks.every(link => selected.has(link.id))}
            ref={(element) => { if (element) element.indeterminate = pageLinks.some(link => selected.has(link.id)) && !pageLinks.every(link => selected.has(link.id)); }}
            onChange={(event) => setSelected((current) => {
              const next = new Set(current);
              for (const link of pageLinks) { if (event.target.checked) next.add(link.id); else next.delete(link.id); }
              return next;
            })} />
          {selectedLinks.length ? `${selectedLinks.length} selected` : range.pages > 1 ? 'Select this page' : 'Select all'}
        </label>
        {selectedLinks.length > 0 && !confirmingBulkRemove && <>
          <button type="button" className={buttonClass('secondary')} disabled={bulkWorking || isRefreshing} onClick={() => void runBulk('Returned', unarchiveLink)}>Return to projects</button>
          <button type="button" className={buttonClass('danger-outline')} disabled={bulkWorking || isRefreshing} onClick={() => setConfirmingBulkRemove(true)}>Remove selected</button>
        </>}
        {confirmingBulkRemove && <div role="group" aria-label="Remove selected links" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-800">Move {plural(selectedLinks.length)} to the Bin? You can recover them for 30 days.</span>
          <button type="button" className={buttonClass('danger')} disabled={bulkWorking} onClick={() => void runBulk('Removed', removeLink)}>Remove</button>
          <button type="button" className={buttonClass('ghost')} disabled={bulkWorking} onClick={() => setConfirmingBulkRemove(false)}>Cancel</button>
        </div>}
      </div>}
      <ListNavigation label="Archived links pages" range={range} count={filtered.length} onPage={setPage} />
      <div ref={cards} data-page={range.page} className="space-y-2">
        {pageLinks.map((link) => <SavedLinkCard key={link.id} layout="row" selected={selected.has(link.id)} onSelectChange={(checked) => toggle(link.id, checked)} cardId={`archived-${link.id}`} link={link} projectName={projectNames.get(link.projectId)} isRestoring={workingId === link.id} onEditTags={() => { setMessage(null); setError(null); setWarnings([]); setTagCandidate(link); }} onUnarchive={() => void returnToProject(link)} onRemove={() => { if (!isRefreshing) startRemoving(link); }} />)}
      </div>
    </>
  );
}
