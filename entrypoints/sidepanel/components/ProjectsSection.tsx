import { InlineConfirmation } from './ui/InlineConfirmation';
import { OperationFeedback } from './ui/OperationFeedback';
import { withSecondaryWarning } from '@/features/operations/secondary-result';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { INBOX_PROJECT_ID } from '@/domain/constants';
import type { DisplayDensity, Project, RestoreMode, SavedLink } from '@/domain/schemas';
import {
  archiveLink,
  createProject,
  deleteProject,
  getParkedSessionGroups,
  getProjects,
  getSettings,
  renameProject,
  removeLink,
  restoreLink,
  restoreProject,
  restoreSession,
  updateSettings,
  type ParkedSessionGroup,
} from '@/messaging/contracts';
import { formatLinkDate, SavedLinkCard } from './SavedLinkCard';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { SETTINGS_UPDATED_EVENT } from './QuickSettings';
import {
  filterAndSortProjectGroups,
  PROJECT_LINK_BATCH_SIZE,
  visibleProjectLinks,
  type SessionOrder,
} from '../project-view';
import { loadUiState, updateUiState } from '../ui-state';

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((first, second) => {
    if (first.isInbox !== second.isInbox) return first.isInbox ? -1 : 1;
    return first.name.localeCompare(second.name);
  });
}

export function ProjectsSection() {
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const projectSelector = useRef<HTMLSelectElement>(null);
  const restoreTrigger = useRef<HTMLButtonElement>(null);
  const renameTrigger = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState(INBOX_PROJECT_ID);
  const [groups, setGroups] = useState<ParkedSessionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [partialRestore, setPartialRestore] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoringSessionId, setRestoringSessionId] = useState<string | null>(null);
  const [isConfirmingRestoreProject, setIsConfirmingRestoreProject] = useState(false);
  const [isRestoringProject, setIsRestoringProject] = useState(false);
  const [lifecycleWorkingId, setLifecycleWorkingId] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);
  const [filter, setFilter] = useState('');
  const [sessionOrder, setSessionOrder] = useState<SessionOrder>('newest');
  const [density, setDensity] = useState<DisplayDensity>('comfortable');
  const [defaultRestoreMode, setDefaultRestoreMode] = useState<RestoreMode>('normal');
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [sessionLimits, setSessionLimits] = useState<Record<string, number>>({});

  function rememberView(patch: Parameters<typeof updateUiState>[0]) {
    void updateUiState(patch).catch((error) => {
      console.warn('LinkShelf could not remember the current view.', error);
      setWarnings((current) => [...current, 'Your view preference could not be saved. The project and link data is unaffected by that preference error.']);
    });
  }

  const selectedProject = projects.find((project) => project.id === selectedId);
  const parkedLinkCount = groups.reduce(
    (total, group) => total + group.links.length,
    0,
  );
  const visibleGroups = useMemo(
    () => filterAndSortProjectGroups(groups, filter, sessionOrder),
    [groups, filter, sessionOrder],
  );
  const visibleLinkCount = visibleGroups.reduce(
    (total, group) => total + group.links.length,
    0,
  );

  useEffect(() => {
    void Promise.all([getProjects(), getSettings(), loadUiState()])
      .then(async ([projectsResponse, settingsResponse, uiState]) => {
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        if (!settingsResponse.success) throw new Error(settingsResponse.error.message);
        const selectedProjectId = projectsResponse.projects.some((project) => project.id === uiState.selectedProjectId)
          ? uiState.selectedProjectId
          : INBOX_PROJECT_ID;
        const groupsResponse = await getParkedSessionGroups(selectedProjectId);
        if (!groupsResponse.success) throw new Error(groupsResponse.error.message);
        setProjects(projectsResponse.projects);
        setSelectedId(selectedProjectId);
        setGroups(groupsResponse.groups);
        setSessionOrder(uiState.sessionOrder);
        setDensity(settingsResponse.settings.displayDensity);
        setDefaultRestoreMode(settingsResponse.settings.defaultRestoreMode);
        const validExpanded = uiState.expandedSessionIds.filter((id) => groupsResponse.groups.some((group) => group.session.id === id));
        setExpandedSessionIds(new Set(validExpanded.length > 0 ? validExpanded : groupsResponse.groups.slice(0, 1).map((group) => group.session.id)));
      })
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load projects.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    function onSettingsUpdated(event: Event) {
      const settings = (event as CustomEvent).detail;
      if (settings?.displayDensity) setDensity(settings.displayDensity);
      if (settings?.defaultRestoreMode) setDefaultRestoreMode(settings.defaultRestoreMode);
    }
    window.addEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated);
  }, []);

  useEffect(() => {
    setSessionLimits({});
    if (filter.trim()) {
      setExpandedSessionIds(new Set(visibleGroups.map((group) => group.session.id)));
    }
  }, [filter]);

  async function selectProject(projectId: string) {
    if (projectId === selectedId) return;
    setSelectedId(projectId);
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setIsRenaming(false);
    setIsConfirmingDelete(false);
    setIsConfirmingRestoreProject(false);
    setFilter('');
    setSessionLimits({});
    try {
      const response = await getParkedSessionGroups(projectId);
      if (!response.success) throw new Error(response.error.message);
      setGroups(response.groups);
      const nextExpanded = new Set(response.groups.slice(0, 1).map((group) => group.session.id));
      setExpandedSessionIds(nextExpanded);
      rememberView({
        selectedProjectId: projectId,
        expandedSessionIds: [...nextExpanded],
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load links.');
    } finally {
      setIsLoading(false);
    }
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim() || isCreating) return;
    setWarnings([]);
    setPartialRestore(false);
    setMessage(null);
    setIsCreating(true);
    setError(null);
    try {
      const response = await createProject(newName);
      if (!response.success) throw new Error(response.error.message);
      setProjects((current) => sortProjects([...current, response.project]));
      setSelectedId(response.project.id);
      setGroups([]);
      setExpandedSessionIds(new Set());
      rememberView({ selectedProjectId: response.project.id, expandedSessionIds: [] });
      setNewName('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not create the project.');
    } finally {
      setIsCreating(false);
    }
  }

  function setOrder(order: SessionOrder) {
    setSessionOrder(order);
    setSessionLimits({});
    rememberView({ sessionOrder: order });
  }

  function toggleSession(sessionId: string) {
    setExpandedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      rememberView({ expandedSessionIds: [...next] });
      return next;
    });
  }

  function setAllSessions(expanded: boolean) {
    const next = expanded
      ? new Set(visibleGroups.map((group) => group.session.id))
      : new Set<string>();
    setExpandedSessionIds(next);
    setSessionLimits({});
    rememberView({ expandedSessionIds: [...next] });
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || !renameName.trim() || isSavingRename) return;
    setWarnings([]);
    setPartialRestore(false);
    setMessage(null);
    setIsSavingRename(true);
    setError(null);
    try {
      const response = await renameProject(selectedProject.id, renameName);
      if (!response.success) throw new Error(response.error.message);
      setProjects((current) => sortProjects(current.map((project) => project.id === response.project.id ? response.project : project)));
      setMessage(`Renamed project to “${response.project.name}”.`);
      setIsRenaming(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not rename the project.');
    } finally {
      setIsSavingRename(false);
    }
  }

  async function removeProject() {
    if (!selectedProject || selectedProject.isInbox || isDeleting) return;
    const projectName = selectedProject.name;
    setWarnings([]);
    setPartialRestore(false);
    setMessage(null);
    setIsDeleting(true);
    setError(null);
    try {
      const response = await deleteProject(selectedProject.id);
      if (!response.success) throw new Error(response.error.message);
      setProjects((current) => current.filter((project) => project.id !== response.deletedProjectId));
      setIsConfirmingDelete(false);
      setSelectedId(response.inboxProjectId);
      setGroups([]);
      const completed = await withSecondaryWarning({ ...response, warnings: [] as string[] }, async () => {
        const groupsResponse = await getParkedSessionGroups(response.inboxProjectId);
        if (!groupsResponse.success) throw new Error(groupsResponse.error.message);
        setGroups(groupsResponse.groups);
        const nextExpanded = new Set(groupsResponse.groups.slice(0, 1).map((group) => group.session.id));
        setExpandedSessionIds(nextExpanded);
        await updateUiState({ selectedProjectId: response.inboxProjectId, expandedSessionIds: [...nextExpanded] });
      }, 'The project was deleted and its links moved to Inbox, but this view could not refresh. Reopen Projects.');
      setWarnings(completed.warnings ?? []);
      setMessage(`Deleted “${projectName}” and moved its links to Inbox.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not delete the project.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRestore(linkId: string) {
    setWarnings([]);
    setPartialRestore(false);
    setMessage(null);
    setRestoringId(linkId);
    setError(null);
    try {
      const response = await restoreLink(linkId);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      if (response.restored) {
        removeLinkFromGroups(linkId);
      } else {
        setMessage('Opened a copy. The link remains parked because of your restore setting.');
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not restore this link.');
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreSession(sessionId: string) {
    setWarnings([]);
    setPartialRestore(false);
    setRestoringSessionId(sessionId);
    setError(null);
    setMessage(null);
    try {
      const response = await restoreSession(sessionId);
      setWarnings(response.warnings ?? []);
      if (!response.success) {
        for (const id of response.progress?.restoredLinkIds ?? []) removeLinkFromGroups(id);
        throw new Error(response.error.message);
      }

      setPartialRestore(!response.complete || response.failedLinkIds.length > 0 || response.fallbackLinkIds.length > 0);
      const restoredIds = new Set(response.restoredLinkIds);
      setGroups((current) =>
        current
          .map((group) => ({
            ...group,
            links: group.links.filter((link) => !restoredIds.has(link.id)),
          }))
          .filter((group) => group.links.length > 0),
      );
      setMessage(
        [
          `Opened ${response.openedLinkIds.length} link${response.openedLinkIds.length === 1 ? '' : 's'} from the session.`,
          response.failedLinkIds.length > 0
            ? `${response.failedLinkIds.length} could not be opened and stayed parked.`
            : '',
          response.restoredLinkIds.length === 0 && response.openedLinkIds.length > 0
            ? 'Copies remain parked because of your restore setting.'
            : '',
        ].filter(Boolean).join(' '),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'LinkShelf could not restore this session.',
      );
      const refreshed = await withSecondaryWarning({ warnings: [] as string[] }, async () => {
        const response = await getParkedSessionGroups(selectedId);
        if (!response.success) throw new Error(response.error.message);
        setGroups(response.groups);
      }, 'The saved list could not refresh. Reopen Projects before retrying any links that already opened.');
      setWarnings((current) => [...current, ...(refreshed.warnings ?? [])]);
    } finally {
      setRestoringSessionId(null);
    }
  }

  async function handleRestoreProject(mode: RestoreMode) {
    if (!selectedProject || parkedLinkCount === 0 || isRestoringProject) return;
    setWarnings([]);
    setPartialRestore(false);
    setIsRestoringProject(true);
    setError(null);
    setMessage(null);
    try {
      const response = await restoreProject(selectedProject.id, mode);
      setWarnings(response.warnings ?? []);
      if (!response.success) {
        for (const id of response.progress?.restoredLinkIds ?? []) removeLinkFromGroups(id);
        if (response.opened) setIsConfirmingRestoreProject(false);
        throw new Error(response.error.message);
      }

      setPartialRestore(!response.complete || response.failedLinkIds.length > 0 || response.fallbackLinkIds.length > 0);
      const restoredIds = new Set(response.restoredLinkIds);
      setGroups((current) =>
        current
          .map((group) => ({
            ...group,
            links: group.links.filter((link) => !restoredIds.has(link.id)),
          }))
          .filter((group) => group.links.length > 0),
      );
      setMessage(
        [
          `Opened ${response.openedLinkIds.length} link${response.openedLinkIds.length === 1 ? '' : 's'} from ${selectedProject.name}.`,
          response.discardedLinkIds.length > 0
            ? `${response.discardedLinkIds.length} restored unloaded.`
            : '',
          response.fallbackLinkIds.length > 0
            ? `${response.fallbackLinkIds.length} could not be unloaded and opened normally.`
            : '',
          response.failedLinkIds.length > 0
            ? `${response.failedLinkIds.length} could not be opened and stayed parked.`
            : '',
          response.restoredLinkIds.length === 0 && response.openedLinkIds.length > 0
            ? 'Copies remain parked because of your restore setting.'
            : '',
        ].filter(Boolean).join(' '),
      );
      setIsConfirmingRestoreProject(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'LinkShelf could not restore this project.',
      );
      const refreshed = await withSecondaryWarning({ warnings: [] as string[] }, async () => {
        const response = await getParkedSessionGroups(selectedProject.id);
        if (!response.success) throw new Error(response.error.message);
        setGroups(response.groups);
      }, 'The saved list could not refresh. Reopen Projects before retrying any links that already opened.');
      setWarnings((current) => [...current, ...(refreshed.warnings ?? [])]);
    } finally {
      setIsRestoringProject(false);
    }
  }

  function removeLinkFromGroups(linkId: string) {
    setGroups((current) =>
      current
        .map((group) => ({
          ...group,
          links: group.links.filter((link) => link.id !== linkId),
        }))
        .filter((group) => group.links.length > 0),
    );
  }

  async function handleArchive(link: SavedLink) {
    setWarnings([]);
    setPartialRestore(false);
    setLifecycleWorkingId(link.id);
    setError(null);
    setMessage(null);
    try {
      const response = await archiveLink(link.id);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      removeLinkFromGroups(link.id);
      setMessage(`Archived “${link.title}”.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not archive this link.');
    } finally {
      setLifecycleWorkingId(null);
    }
  }

  function startRemoving(link: SavedLink) {
    setMessage(null);
    setError(null);
    setWarnings([]);
    setRemoveCandidate(link);
  }

  async function confirmRemoveLink() {
    if (dialogPending || !removeCandidate) return;
    const link = removeCandidate;
    setWarnings([]);
    setDialogPending(true);
    setPartialRestore(false);
    setLifecycleWorkingId(link.id);
    setError(null);
    setMessage(null);
    try {
      const response = await removeLink(link.id);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      removeLinkFromGroups(link.id);
      setRemoveCandidate(null);
      setMessage(`Removed “${link.title}” from LinkShelf.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not remove this link.');
    } finally {
      setLifecycleWorkingId(null);
      setDialogPending(false);
    }
  }

  const managingProject = isDeleting || isRestoringProject || isSavingRename;
  const feedback = { pending: isDeleting ? 'Moving links to Inbox…' : isRestoringProject || restoringSessionId || restoringId ? 'Restoring links…' : isCreating || isSavingRename ? 'Saving project…' : lifecycleWorkingId ? 'Updating link…' : undefined, message, error, warnings, partial: partialRestore };

  return (
    <>
      <OperationFeedback {...(!(removeCandidate) ? feedback : {})} />
      <div className="sticky top-[130px] z-20 mb-4 rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="project-selector">Project</label>
          <select ref={projectSelector} disabled={managingProject} id="project-selector" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" value={selectedId} onChange={(event) => void selectProject(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <select aria-label="Session order" className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold" value={sessionOrder} onChange={(event) => setOrder(event.target.value as SessionOrder)}><option value="newest">Newest</option><option value="oldest">Oldest</option></select>
          <button type="button" className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold" onClick={() => {
            const next = density === 'comfortable' ? 'compact' : 'comfortable';
            setDensity(next);
            void getSettings().then(async (response) => {
              if (response.success) await updateSettings({ ...response.settings, displayDensity: next });
            });
          }}>{density === 'compact' ? 'Compact' : 'Comfortable'}</button>
        </div>
        <label className="sr-only" htmlFor="project-filter">Filter this project</label>
        <input id="project-filter" type="search" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Filter title, URL, domain, or note..." value={filter} onChange={(event) => setFilter(event.target.value)} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{visibleLinkCount} visible of {parkedLinkCount} tab{parkedLinkCount === 1 ? '' : 's'}</span>
          <span className="flex gap-1"><button type="button" className="rounded-md px-2 py-1 font-semibold text-blue-700 hover:bg-blue-50" onClick={() => setAllSessions(true)}>Expand all</button><button type="button" className="rounded-md px-2 py-1 font-semibold text-blue-700 hover:bg-blue-50" onClick={() => setAllSessions(false)}>Collapse all</button></span>
        </div>
        <details className="mt-2 border-t border-slate-100 pt-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">Create a project</summary>
          <form className="mt-2 flex gap-2" onSubmit={addProject}>
            <label className="sr-only" htmlFor="new-project">New project name</label>
            <input id="new-project" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Project name" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!newName.trim() || isCreating}>{isCreating ? 'Adding...' : 'Add'}</button>
          </form>
        </details>
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-slate-500">Selected project</p><h2 ref={sectionHeading} tabIndex={-1} className="mt-1 text-lg font-bold">{selectedProject?.name ?? 'Inbox'}</h2></div>
        <div className="flex flex-wrap justify-end gap-2">
          {parkedLinkCount > 0 && (
            <button ref={restoreTrigger} type="button" disabled={managingProject} className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50" onClick={() => { setIsConfirmingRestoreProject(true); setIsConfirmingDelete(false); setIsRenaming(false); }}>
              Restore all
            </button>
          )}
          {selectedProject && !selectedProject.isInbox && (
            <>
              <button ref={renameTrigger} type="button" disabled={managingProject} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={() => { setRenameName(selectedProject.name); setIsRenaming(true); setIsConfirmingDelete(false); setIsConfirmingRestoreProject(false); }}>Rename</button>
              <button ref={deleteTrigger} type="button" disabled={managingProject} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50" onClick={() => { setIsConfirmingDelete(true); setIsRenaming(false); setIsConfirmingRestoreProject(false); }}>Delete</button>
            </>
          )}
        </div>
      </div>

      {isConfirmingRestoreProject && selectedProject && (
        <InlineConfirmation titleId="restore-project-title" title={<>Restore all {parkedLinkCount} links from {selectedProject.name}?</>}
          className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3.5" titleClassName="font-semibold text-blue-950"
          returnFocus={() => restoreTrigger.current ?? sectionHeading.current}>
          <p className="mt-1 text-sm text-blue-900">
            Choose whether Chrome should load every page normally or keep tabs unloaded until you activate them.
          </p>
          {parkedLinkCount > 20 && (
            <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-900">
              This is a large project and will open many tabs at once.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${defaultRestoreMode === 'normal' ? 'bg-blue-700' : 'bg-slate-700'}`} disabled={isRestoringProject} onClick={() => void handleRestoreProject('normal')}>
              {isRestoringProject ? 'Restoring...' : `Restore normally${defaultRestoreMode === 'normal' ? ' · Default' : ''}`}
            </button>
            <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${defaultRestoreMode === 'unloaded' ? 'bg-blue-700' : 'bg-slate-700'}`} disabled={isRestoringProject} onClick={() => void handleRestoreProject('unloaded')}>
              {isRestoringProject ? 'Restoring...' : `Restore unloaded${defaultRestoreMode === 'unloaded' ? ' · Default' : ''}`}
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold" disabled={isRestoringProject} onClick={() => setIsConfirmingRestoreProject(false)}>Cancel</button>
          </div>
        </InlineConfirmation>
      )}

      {isRenaming && (
        <InlineConfirmation titleId="rename-project-title" title="Rename project" className="mb-3 rounded-xl border border-slate-200 bg-white p-3.5"
          returnFocus={() => renameTrigger.current ?? projectSelector.current}>
          <form onSubmit={saveRename}>
          <label className="sr-only" htmlFor="rename-project">Project name</label>
          <input id="rename-project" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={renameName} onChange={(event) => setRenameName(event.target.value)} />
          <div className="mt-3 flex justify-end gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={isSavingRename} onClick={() => setIsRenaming(false)}>Cancel</button><button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={isSavingRename}>{isSavingRename ? 'Saving...' : 'Save name'}</button></div>
        </form>
        </InlineConfirmation>
      )}

      {isConfirmingDelete && selectedProject && (
        <InlineConfirmation titleId="delete-project-title" title={<>Delete “{selectedProject.name}”?</>}
          className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3.5" titleClassName="font-semibold text-red-900"
          returnFocus={() => deleteTrigger.current ?? sectionHeading.current}>
          <p className="mt-1 text-sm text-red-800">Its links and sessions will move to Inbox. Nothing is permanently deleted.</p>
          <div className="mt-3 flex justify-end gap-2"><button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm" disabled={isDeleting} onClick={() => setIsConfirmingDelete(false)}>Cancel</button><button type="button" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white" disabled={isDeleting} onClick={() => void removeProject()}>{isDeleting ? 'Moving...' : 'Move to Inbox and delete'}</button></div>
        </InlineConfirmation>
      )}

      {removeCandidate && (
        <RemoveLinkDialog
          link={removeCandidate}
          feedback={<OperationFeedback {...feedback} pending={dialogPending ? 'Updating link…' : undefined} />}
          returnFocus={(invoker) => invoker ?? sectionHeading.current}
          isRemoving={dialogPending}
          onCancel={() => setRemoveCandidate(null)}
          onConfirm={() => void confirmRemoveLink()}
        />
      )}

      {isLoading && <SkeletonCards count={2} />}
      {!isLoading && !error && groups.length === 0 && <EmptyState title="This project is empty">Park tabs into {selectedProject?.name ?? 'this project'} to start a focused workspace.</EmptyState>}
      {!isLoading && !error && groups.length > 0 && visibleGroups.length === 0 && <EmptyState title="No matching tabs">Clear the project filter or try a different title, URL, domain, or note.</EmptyState>}
      <div className="space-y-4">
        {visibleGroups.map((group) => {
          const isExpanded = expandedSessionIds.has(group.session.id);
          const limit = sessionLimits[group.session.id] ?? PROJECT_LINK_BATCH_SIZE;
          const shownLinks = visibleProjectLinks(group, limit);
          return (
          <section key={group.session.id} className={`rounded-2xl border border-slate-300 bg-slate-100 ${density === 'compact' ? 'p-2' : 'p-3'}`}>
            <div className={`${isExpanded ? 'mb-3' : ''} rounded-xl bg-white p-3`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={isExpanded} onClick={() => toggleSession(group.session.id)}>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Parking session</p>
                  <h3 className="mt-1 font-semibold"><span aria-hidden="true">{isExpanded ? '▾' : '▸'} </span>{formatLinkDate(group.session.createdAt)}</h3>
                  <p className="mt-1 text-sm text-slate-500">{group.links.length} parked link{group.links.length === 1 ? '' : 's'}</p>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={restoringSessionId !== null || restoringId !== null || isRestoringProject}
                  onClick={() => void handleRestoreSession(group.session.id)}
                >
                  {restoringSessionId === group.session.id ? 'Restoring...' : 'Restore session'}
                </button>
              </div>
              {group.session.reminderAt && <p className="mt-2 text-xs font-semibold text-amber-700">Reminder {formatLinkDate(group.session.reminderAt)}</p>}
            </div>
            {isExpanded && <div className="space-y-2">
              {shownLinks.map((link) => (
                <SavedLinkCard
                  key={link.id}
                  link={link}
                  note={link.note ?? group.session.note}
                  density={density}
                  isRestoring={restoringId === link.id || restoringSessionId === group.session.id || isRestoringProject || lifecycleWorkingId === link.id}
                  onRestore={() => void handleRestore(link.id)}
                  onArchive={() => void handleArchive(link)}
                  onRemove={() => startRemoving(link)}
                />
              ))}
              {shownLinks.length < group.links.length && <div className="flex gap-2 pt-1"><button type="button" className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700" onClick={() => setSessionLimits((current) => ({ ...current, [group.session.id]: limit + PROJECT_LINK_BATCH_SIZE }))}>Show {Math.min(PROJECT_LINK_BATCH_SIZE, group.links.length - shownLinks.length)} more</button><button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600" onClick={() => setSessionLimits((current) => ({ ...current, [group.session.id]: group.links.length }))}>Show all</button></div>}
            </div>}
          </section>
        );})}
      </div>
    </>
  );
}
