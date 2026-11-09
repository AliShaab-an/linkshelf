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
  moveLink,
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
import { MoveLinkDialog } from './MoveLinkDialog';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { SETTINGS_UPDATED_EVENT } from './QuickSettings';
import {
  filterAndSortProjectGroups,
  PROJECT_LINK_BATCH_SIZE,
  visibleProjectLinks,
  type SessionOrder,
} from '../project-view';
import { loadUiState, updateUiState } from '../ui-state';
import { DATABASE_STORAGE_KEY } from '@/storage/repository';

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((first, second) => {
    if (first.isInbox !== second.isInbox) return first.isInbox ? -1 : 1;
    return first.name.localeCompare(second.name);
  });
}

export function ProjectsSection({ isManager = true, initialProjectId, onProjectChange, onParkTabs }: { isManager?: boolean; initialProjectId?: string; onProjectChange?: (projectId: string) => void; onParkTabs?: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState(INBOX_PROJECT_ID);
  const [groups, setGroups] = useState<ParkedSessionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);
  const [moveCandidate, setMoveCandidate] = useState<SavedLink | null>(null);
  const [moveProjectId, setMoveProjectId] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sessionOrder, setSessionOrder] = useState<SessionOrder>('newest');
  const [density, setDensity] = useState<DisplayDensity>('comfortable');
  const [defaultRestoreMode, setDefaultRestoreMode] = useState<RestoreMode>('normal');
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [sessionLimits, setSessionLimits] = useState<Record<string, number>>({});
  const requestIdRef = useRef(0);
  const selectedIdRef = useRef(selectedId);

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
    let disposed = false;
    void Promise.all([getProjects(), getSettings(), loadUiState()])
      .then(async ([projectsResponse, settingsResponse, uiState]) => {
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        if (!settingsResponse.success) throw new Error(settingsResponse.error.message);
        const preferredId = initialProjectId ?? uiState.selectedProjectId;
        const selectedProjectId = projectsResponse.projects.some((project) => project.id === preferredId)
          ? preferredId
          : INBOX_PROJECT_ID;
        const groupsResponse = await getParkedSessionGroups(selectedProjectId);
        if (!groupsResponse.success) throw new Error(groupsResponse.error.message);
        if (disposed) return;
        setProjects(projectsResponse.projects);
        selectedIdRef.current = selectedProjectId;
        setSelectedId(selectedProjectId);
        onProjectChange?.(selectedProjectId);
        setGroups(groupsResponse.groups);
        setSessionOrder(uiState.sessionOrder);
        setDensity(settingsResponse.settings.displayDensity);
        setDefaultRestoreMode(settingsResponse.settings.defaultRestoreMode);
        const validExpanded = uiState.expandedSessionIds.filter((id) => groupsResponse.groups.some((group) => group.session.id === id));
        setExpandedSessionIds(new Set(validExpanded.length > 0 ? validExpanded : groupsResponse.groups.slice(0, 1).map((group) => group.session.id)));
        void updateUiState({ selectedProjectId }).catch(() => undefined);
      })
      .catch((caughtError) => { if (!disposed) setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load projects.'); })
      .finally(() => { if (!disposed) setIsLoading(false); });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    let disposed = false;
    let refreshVersion = 0;
    async function refresh() {
      const requestId = ++refreshVersion;
      try {
        const [projectsResponse, settingsResponse] = await Promise.all([getProjects(), getSettings()]);
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        if (!settingsResponse.success) throw new Error(settingsResponse.error.message);
        const projectId = projectsResponse.projects.some((project) => project.id === selectedId) ? selectedId : INBOX_PROJECT_ID;
        const response = await getParkedSessionGroups(projectId);
        if (!response.success) throw new Error(response.error.message);
        if (disposed || requestId !== refreshVersion || selectedIdRef.current !== selectedId) return;
        setProjects(projectsResponse.projects);
        setGroups(response.groups);
        selectedIdRef.current = projectId;
        setSelectedId(projectId);
        onProjectChange?.(projectId);
        setDensity(settingsResponse.settings.displayDensity);
        setDefaultRestoreMode(settingsResponse.settings.defaultRestoreMode);
      } catch (caughtError) {
        if (!disposed && requestId === refreshVersion && selectedIdRef.current === selectedId) setError(caughtError instanceof Error ? caughtError.message : 'Could not refresh saved tabs.');
      }
    }
    function onChange(changes: Record<string, Browser.storage.StorageChange>, area: string) {
      if (area === 'local' && changes[DATABASE_STORAGE_KEY]) void refresh();
    }
    browser.storage.onChanged.addListener(onChange);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(onChange);
      window.removeEventListener('focus', refresh);
    };
  }, [selectedId]);

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
    const requestId = ++requestIdRef.current;
    selectedIdRef.current = projectId;
    setSelectedId(projectId);
    onProjectChange?.(projectId);
    setGroups([]);
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
      if (requestId !== requestIdRef.current) return;
      setGroups(response.groups);
      const nextExpanded = new Set(response.groups.slice(0, 1).map((group) => group.session.id));
      setExpandedSessionIds(nextExpanded);
      void updateUiState({
        selectedProjectId: projectId,
        expandedSessionIds: [...nextExpanded],
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load links.');
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const response = await createProject(newName);
      if (!response.success) throw new Error(response.error.message);
      setProjects((current) => sortProjects([...current.filter((project) => project.id !== response.project.id), response.project]));
      selectedIdRef.current = response.project.id;
      setSelectedId(response.project.id);
      onProjectChange?.(response.project.id);
      setGroups([]);
      setExpandedSessionIds(new Set());
      void updateUiState({ selectedProjectId: response.project.id, expandedSessionIds: [] });
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
    void updateUiState({ sessionOrder: order });
  }

  function toggleSession(sessionId: string) {
    setExpandedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      void updateUiState({ expandedSessionIds: [...next] });
      return next;
    });
  }

  function setAllSessions(expanded: boolean) {
    const next = expanded
      ? new Set(visibleGroups.map((group) => group.session.id))
      : new Set<string>();
    setExpandedSessionIds(next);
    setSessionLimits({});
    void updateUiState({ expandedSessionIds: [...next] });
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || !renameName.trim() || isSavingRename) return;
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
    setIsDeleting(true);
    setError(null);
    try {
      const response = await deleteProject(selectedProject.id);
      if (!response.success) throw new Error(response.error.message);
      setProjects((current) => current.filter((project) => project.id !== response.deletedProjectId));
      selectedIdRef.current = response.inboxProjectId;
      setSelectedId(response.inboxProjectId);
      onProjectChange?.(response.inboxProjectId);
      const groupsResponse = await getParkedSessionGroups(response.inboxProjectId);
      if (!groupsResponse.success) throw new Error(groupsResponse.error.message);
      setGroups(groupsResponse.groups);
      setIsConfirmingDelete(false);
      const nextExpanded = new Set(groupsResponse.groups.slice(0, 1).map((group) => group.session.id));
      setExpandedSessionIds(nextExpanded);
      void updateUiState({ selectedProjectId: response.inboxProjectId, expandedSessionIds: [...nextExpanded] });
      setMessage(`Deleted “${projectName}” and moved its links to Inbox.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not delete the project.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRestore(linkId: string) {
    setRestoringId(linkId);
    setError(null);
    try {
      const response = await restoreLink(linkId);
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
    setRestoringSessionId(sessionId);
    setError(null);
    setMessage(null);
    try {
      const response = await restoreSession(sessionId);
      if (!response.success) {
        throw new Error(response.error.message);
      }

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
      const refreshed = await getParkedSessionGroups(selectedId);
      if (refreshed.success) setGroups(refreshed.groups);
    } finally {
      setRestoringSessionId(null);
    }
  }

  async function handleRestoreProject(mode: RestoreMode) {
    if (!selectedProject || parkedLinkCount === 0 || isRestoringProject) return;
    setIsRestoringProject(true);
    setError(null);
    setMessage(null);
    try {
      const response = await restoreProject(selectedProject.id, mode);
      if (!response.success) throw new Error(response.error.message);

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
      const refreshed = await getParkedSessionGroups(selectedProject.id);
      if (refreshed.success) setGroups(refreshed.groups);
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
    setLifecycleWorkingId(link.id);
    setError(null);
    setMessage(null);
    try {
      const response = await archiveLink(link.id);
      if (!response.success) throw new Error(response.error.message);
      removeLinkFromGroups(link.id);
      setMessage(`Archived “${link.title}”.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not archive this link.');
    } finally {
      setLifecycleWorkingId(null);
    }
  }

  async function confirmRemoveLink() {
    if (!removeCandidate) return;
    const link = removeCandidate;
    setLifecycleWorkingId(link.id);
    setError(null);
    setMessage(null);
    try {
      const response = await removeLink(link.id);
      if (!response.success) throw new Error(response.error.message);
      removeLinkFromGroups(link.id);
      setRemoveCandidate(null);
      setMessage(`Removed “${link.title}” from LinkShelf.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not remove this link.');
    } finally {
      setLifecycleWorkingId(null);
    }
  }

  async function confirmMove() {
    if (!moveCandidate || !moveProjectId || lifecycleWorkingId) return;
    setLifecycleWorkingId(moveCandidate.id);
    setMoveError(null);
    try {
      const response = await moveLink(moveCandidate.id, moveProjectId);
      if (!response.success) throw new Error(response.error.message);
      if (moveProjectId !== selectedId) removeLinkFromGroups(moveCandidate.id);
      setMessage(`Moved “${moveCandidate.title}” to ${projects.find((project) => project.id === moveProjectId)?.name ?? 'its project'}.`);
      setMoveCandidate(null);
    } catch (caughtError) {
      setMoveError(caughtError instanceof Error ? caughtError.message : 'Could not move this link. Try again.');
    } finally {
      setLifecycleWorkingId(null);
    }
  }

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="project-selector">Project</label>
          <select id="project-selector" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" value={selectedId} disabled={isLoading || isRestoringProject || restoringSessionId !== null || restoringId !== null || isDeleting || lifecycleWorkingId !== null} onChange={(event) => void selectProject(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          {isManager && <>
          <select aria-label="Session order" className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold" value={sessionOrder} onChange={(event) => setOrder(event.target.value as SessionOrder)}><option value="newest">Newest</option><option value="oldest">Oldest</option></select>
          <button type="button" className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold" onClick={() => {
            const next = density === 'comfortable' ? 'compact' : 'comfortable';
            setDensity(next);
            void getSettings().then(async (response) => {
              if (response.success) await updateSettings({ ...response.settings, displayDensity: next });
            });
          }}>{density === 'compact' ? 'Compact' : 'Comfortable'}</button>
          </>}
        </div>
        {isManager && <><label className="sr-only" htmlFor="project-filter">Filter this project</label>
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
        </details></>}
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-slate-500">Selected project</p><h2 className="mt-1 text-lg font-bold">{selectedProject?.name ?? 'Inbox'}</h2></div>
        <div className="flex flex-wrap justify-end gap-2">
          {parkedLinkCount > 0 && (
            <button type="button" className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white" onClick={() => { setIsConfirmingRestoreProject(true); setIsConfirmingDelete(false); setIsRenaming(false); }}>
              Reopen all
            </button>
          )}
          {isManager && selectedProject && !selectedProject.isInbox && (
            <>
              <button type="button" className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold" onClick={() => { setRenameName(selectedProject.name); setIsRenaming(true); setIsConfirmingDelete(false); setIsConfirmingRestoreProject(false); }}>Rename</button>
              <button type="button" className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700" onClick={() => { setIsConfirmingDelete(true); setIsRenaming(false); setIsConfirmingRestoreProject(false); }}>Delete</button>
            </>
          )}
        </div>
      </div>

      {isConfirmingRestoreProject && selectedProject && (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3.5" role="alertdialog" aria-labelledby="restore-project-title">
          <h3 id="restore-project-title" className="font-semibold text-blue-950">
            Reopen all {parkedLinkCount} links from {selectedProject.name}?
          </h3>
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
              {isRestoringProject ? 'Opening…' : `Open normally${defaultRestoreMode === 'normal' ? ' · Default' : ''}`}
            </button>
            <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${defaultRestoreMode === 'unloaded' ? 'bg-blue-700' : 'bg-slate-700'}`} disabled={isRestoringProject} onClick={() => void handleRestoreProject('unloaded')}>
              {isRestoringProject ? 'Opening…' : `Open unloaded${defaultRestoreMode === 'unloaded' ? ' · Default' : ''}`}
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold" disabled={isRestoringProject} onClick={() => setIsConfirmingRestoreProject(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isRenaming && (
        <form className="mb-3 rounded-xl border border-slate-200 bg-white p-3.5" onSubmit={saveRename}>
          <label className="text-sm font-semibold" htmlFor="rename-project">Rename project</label>
          <input id="rename-project" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={renameName} onChange={(event) => setRenameName(event.target.value)} />
          <div className="mt-3 flex justify-end gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setIsRenaming(false)}>Cancel</button><button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={isSavingRename}>{isSavingRename ? 'Saving...' : 'Save name'}</button></div>
        </form>
      )}

      {isConfirmingDelete && selectedProject && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3.5" role="alertdialog">
          <h3 className="font-semibold text-red-900">Delete “{selectedProject.name}”?</h3>
          <p className="mt-1 text-sm text-red-800">Its links and sessions will move to Inbox. Nothing is permanently deleted.</p>
          <div className="mt-3 flex justify-end gap-2"><button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={() => setIsConfirmingDelete(false)}>Cancel</button><button type="button" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white" disabled={isDeleting} onClick={() => void removeProject()}>{isDeleting ? 'Moving...' : 'Move to Inbox and delete'}</button></div>
        </div>
      )}

      {moveCandidate && <MoveLinkDialog link={moveCandidate} projects={projects} selectedProjectId={moveProjectId} isMoving={lifecycleWorkingId === moveCandidate.id} error={moveError} onSelect={setMoveProjectId} onCancel={() => setMoveCandidate(null)} onConfirm={() => void confirmMove()} />}
      {removeCandidate && (
        <RemoveLinkDialog
          link={removeCandidate}
          isRemoving={lifecycleWorkingId === removeCandidate.id}
          onCancel={() => setRemoveCandidate(null)}
          onConfirm={() => void confirmRemoveLink()}
        />
      )}

      {message && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {isLoading && <SkeletonCards count={2} />}
      {!isLoading && !error && groups.length === 0 && <EmptyState title="No saved tabs here yet">Choose Park tabs, select the pages you want to return to, and save them into {selectedProject?.name ?? 'this project'}.{onParkTabs && <button type="button" className="mt-3 block w-full rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white" onClick={onParkTabs}>Park tabs</button>}</EmptyState>}
      {!isLoading && !error && groups.length > 0 && visibleGroups.length === 0 && <EmptyState title="No matching tabs">Clear the project filter or try a different title, URL, domain, or note.</EmptyState>}
      <div className={isManager ? 'grid items-start gap-4 lg:grid-cols-2' : 'space-y-3'}>
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
                  {restoringSessionId === group.session.id ? 'Opening…' : 'Reopen session'}
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
                  density={isManager ? density : 'compact'}
                  projectName={selectedProject?.name}
                  isRestoring={restoringId === link.id || restoringSessionId === group.session.id || isRestoringProject || lifecycleWorkingId === link.id}
                  onRestore={() => void handleRestore(link.id)}
                  onArchive={() => void handleArchive(link)}
                  onMove={isManager ? () => { setMoveCandidate(link); setMoveProjectId(link.projectId); setMoveError(null); } : undefined}
                  onRemove={() => setRemoveCandidate(link)}
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
