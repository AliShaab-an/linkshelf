import { InlineConfirmation } from './ui/InlineConfirmation';
import { OperationFeedback } from './ui/OperationFeedback';
import { withSecondaryWarning } from '@/features/operations/secondary-result';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { INBOX_PROJECT_ID } from '@/domain/constants';
import { SettingsSchema, type DisplayDensity, type Project, type RestoreMode, type SavedLink, type Settings } from '@/domain/schemas';
import { browser } from 'wxt/browser';
import { describeCollectionRestore, describeLinkRestore } from '../restore-feedback';
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
  patchSettings,
  type ParkedSessionGroup,
} from '@/messaging/contracts';
import { formatLinkDate, SavedLinkCard } from './SavedLinkCard';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { Disclosure } from './ui/Disclosure';
import { Icon } from './ui/Icon';
import { Select } from './ui/Select';
import {
  filterAndSortProjectGroups,
  PROJECT_LINK_BATCH_SIZE,
  visibleProjectLinks,
  type SessionOrder,
} from '../project-view';
import { loadUiState, updateUiState } from '../ui-state';
import type { SavedSessionTarget } from '../parking-outcome';

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((first, second) => {
    if (first.isInbox !== second.isInbox) return first.isInbox ? -1 : 1;
    return first.name.localeCompare(second.name);
  });
}

const toolbarButton = 'inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold disabled:opacity-50';

export function ProjectsSection({ savedSession }: { savedSession?: SavedSessionTarget }) {
  const target = useRef(savedSession).current;
  const targetButton = useRef<HTMLButtonElement>(null);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const projectSelector = useRef<HTMLSelectElement>(null);
  const restoreTrigger = useRef<HTMLButtonElement>(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const createInput = useRef<HTMLInputElement>(null);
  const projectActionsTrigger = useRef<HTMLButtonElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState(INBOX_PROJECT_ID);
  const [groups, setGroups] = useState<ParkedSessionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [partialRestore, setPartialRestore] = useState(false);
  const [newName, setNewName] = useState('');
  const [isAddingProject, setIsAddingProject] = useState(false);
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
  const [restoreBehavior, setRestoreBehavior] = useState<Settings['defaultRestoreBehavior']>('restore-and-remove');
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
  const sessionCounts = useMemo(() => new Map(groups.map(({ session, links }) => [session.id, links.length])), [groups]);

  useEffect(() => {
    let current = true;
    void Promise.all([getProjects(), getSettings(), loadUiState()])
      .then(async ([projectsResponse, settingsResponse, uiState]) => {
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        if (!settingsResponse.success) throw new Error(settingsResponse.error.message);
        const requestedProject = target?.projectId ?? uiState.selectedProjectId;
        const selectedProjectId = projectsResponse.projects.some((project) => project.id === requestedProject)
          ? requestedProject
          : INBOX_PROJECT_ID;
        const groupsResponse = await getParkedSessionGroups(selectedProjectId);
        if (!current) return;
        if (!groupsResponse.success) throw new Error(groupsResponse.error.message);
        setProjects(projectsResponse.projects);
        setSelectedId(selectedProjectId);
        setGroups(groupsResponse.groups);
        setSessionOrder(uiState.sessionOrder);
        setDensity(settingsResponse.settings.displayDensity);
        setDefaultRestoreMode(settingsResponse.settings.defaultRestoreMode);
        setRestoreBehavior(settingsResponse.settings.defaultRestoreBehavior);
        const validExpanded = uiState.expandedSessionIds.filter((id) => groupsResponse.groups.some((group) => group.session.id === id));
        if (target && groupsResponse.groups.some(group => group.session.id === target.sessionId)) validExpanded.push(target.sessionId);
        setExpandedSessionIds(new Set(validExpanded.length > 0 ? validExpanded : groupsResponse.groups.slice(0, 1).map((group) => group.session.id)));
      })
      .catch((caughtError) => { if (current) setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load projects.'); })
      .finally(() => { if (current) setIsLoading(false); });
    return () => { current = false; };
  }, [target]);

  useEffect(() => {
    if (!target || isLoading) return;
    const destination = targetButton.current ?? sectionHeading.current;
    if (document.activeElement === document.body) {
      destination?.focus({ preventScroll: true });
      destination?.scrollIntoView({ block: 'center' });
    }
  }, [target, isLoading]);

  useEffect(() => {
    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !changes.linkshelfDatabase) return;
      const { oldValue, newValue } = changes.linkshelfDatabase;
      const before = (oldValue as { settings?: Partial<Settings> } | undefined)?.settings;
      const after = (newValue as { settings?: Partial<Settings> } | undefined)?.settings;
      if (before?.defaultRestoreMode === after?.defaultRestoreMode &&
          before?.defaultRestoreBehavior === after?.defaultRestoreBehavior &&
          before?.displayDensity === after?.displayDensity) return;
      const result = SettingsSchema.safeParse(after);
      if (!result.success) return;
      setDefaultRestoreMode(result.data.defaultRestoreMode);
      setRestoreBehavior(result.data.defaultRestoreBehavior);
      setDensity(result.data.displayDensity);
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => browser.storage.onChanged.removeListener(onStorageChanged);
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
    setIsAddingProject(false);
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
      setFilter('');
      setIsAddingProject(false);
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

  async function changeDensity(next: DisplayDensity) {
    setError(null);
    try {
      const response = await patchSettings({ displayDensity: next });
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      setDensity(response.settings.displayDensity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save link spacing.');
    }
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
      if (!response.success) throw new Error(describeLinkRestore(response));
      if (response.restored) removeLinkFromGroups(linkId);
      setMessage(describeLinkRestore(response));
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
      setMessage(describeCollectionRestore(response));
      if (!response.success) {
        setPartialRestore(true);
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
      setMessage(describeCollectionRestore(response));
      if (!response.success) {
        setPartialRestore(true);
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
  const restoring = isRestoringProject || restoringSessionId !== null || restoringId !== null;
  const parkedCopyPreference = restoreBehavior === 'open-copy'
    ? 'Opened links stay parked.'
    : 'Successfully restored links leave the parked list.';
  const feedback = { pending: isDeleting ? 'Moving links to Inbox…' : isRestoringProject || restoringSessionId || restoringId ? 'Restoring links…' : isCreating || isSavingRename ? 'Saving project…' : lifecycleWorkingId ? 'Updating link…' : undefined, message, error, warnings, partial: partialRestore };

  return (
    <>
      <OperationFeedback {...(!(removeCandidate) ? feedback : {})} />
      <h2 ref={sectionHeading} tabIndex={-1} className="mb-2 text-lg font-bold">Saved</h2>
      <div className={`projects-toolbar relative z-20 mb-3 grid grid-cols-1 gap-2 ${isAddingProject || isConfirmingRestoreProject || isRenaming || isConfirmingDelete ? '' : 'projects-toolbar-sticky'}`}>
        <div className="relative flex items-center gap-2">
          <label className="sr-only" htmlFor="project-selector">Project</label>
          <Select ref={projectSelector} id="project-selector" className="w-0 flex-1"
            title={selectedProject?.name} disabled={managingProject || restoring || isCreating || isLoading}
            value={selectedId} onChange={(event) => void selectProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
          <button ref={createTrigger} type="button" aria-label="New project" title="New project"
            aria-expanded={isAddingProject} aria-controls={isAddingProject ? 'create-project' : undefined}
            disabled={managingProject || restoring || isCreating || isLoading}
            className={`${toolbarButton} w-10 shrink-0 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
            onClick={() => {
              setIsAddingProject(!isAddingProject);
              setIsRenaming(false);
              setIsConfirmingDelete(false);
              setIsConfirmingRestoreProject(false);
            }}>
            <span aria-hidden="true" className="text-xl leading-none">+</span>
          </button>
          <Disclosure label="Project actions" triggerContent={<Icon name="more" />} triggerRef={projectActionsTrigger}
            disabled={!selectedProject || selectedProject.isInbox || managingProject || restoring || isCreating || isLoading}>
            {close => <>
              <button type="button" className="dropdown-action"
                onClick={() => {
                  close();
                  setRenameName(selectedProject?.name ?? '');
                  setIsRenaming(true);
                  setIsAddingProject(false);
                  setIsConfirmingDelete(false);
                  setIsConfirmingRestoreProject(false);
                }}>Rename</button>
              <button type="button" className="dropdown-action text-red-700 hover:bg-red-50"
                onClick={() => {
                  close();
                  setIsConfirmingDelete(true);
                  setIsAddingProject(false);
                  setIsRenaming(false);
                  setIsConfirmingRestoreProject(false);
                }}>Delete</button>
            </>}
          </Disclosure>
        </div>

        {isAddingProject && <InlineConfirmation titleId="create-project-title" title="New project"
          className="rounded-lg border border-slate-200 bg-white p-2.5" initialFocus={() => createInput.current}
          returnFocus={() => createTrigger.current}>
          <form id="create-project" className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={addProject}
            onKeyDown={event => {
              if (event.key === 'Escape' && !isCreating) {
                event.preventDefault();
                setIsAddingProject(false);
              }
            }}>
            <label className="sr-only" htmlFor="new-project">New project name</label>
            <input ref={createInput} id="new-project" className="min-w-0 rounded-lg border border-slate-300 px-2.5 text-sm"
              placeholder="Project name" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button className={`${toolbarButton} bg-blue-700 text-white hover:bg-blue-800`}
              disabled={!newName.trim() || isCreating || restoring || managingProject}>{isCreating ? 'Creating…' : 'Create project'}</button>
            <button type="button" className={`${toolbarButton} col-span-2 justify-self-end text-slate-700 hover:bg-slate-100`}
              disabled={isCreating} onClick={() => setIsAddingProject(false)}>Cancel</button>
          </form>
        </InlineConfirmation>}

        <div className="relative flex items-center gap-2">
          <label className="sr-only" htmlFor="project-filter">Filter this project</label>
          <input id="project-filter" type="search"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
            placeholder="Filter this project" value={filter} onChange={(event) => setFilter(event.target.value)} />
          <Disclosure label="View options" triggerContent={<>View <span aria-hidden="true">▾</span></>}>
            {() => <>
              <label className="grid gap-1 px-1 py-1 text-xs font-semibold text-slate-700">
                Session order
                <Select value={sessionOrder} onChange={(event) => setOrder(event.target.value as SessionOrder)}>
                  <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
                </Select>
              </label>
              <label className="grid gap-1 px-1 py-1 text-xs font-semibold text-slate-700">
                Density
                <Select value={density} onChange={(event) => void changeDensity(event.target.value as DisplayDensity)}>
                  <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
                </Select>
              </label>
            </>}
          </Disclosure>
        </div>
        {parkedLinkCount > 0 && <div className="flex min-h-10 items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {visibleLinkCount !== parkedLinkCount && `${visibleLinkCount} of `}{parkedLinkCount} parked link{parkedLinkCount === 1 ? '' : 's'}
          </p>
          <button ref={restoreTrigger} type="button" aria-describedby="project-restore-scope"
            disabled={managingProject || restoring || isLoading || isCreating}
            className={`${toolbarButton} bg-blue-700 text-white hover:bg-blue-800`}
            onClick={() => {
              setIsConfirmingRestoreProject(true);
              setIsAddingProject(false);
              setIsConfirmingDelete(false);
              setIsRenaming(false);
            }}>Restore all</button>
          <p id="project-restore-scope" className="sr-only">Opens all {parkedLinkCount} parked links in this project, including links hidden by the filter. {parkedCopyPreference}</p>
        </div>}
      </div>

      {isConfirmingRestoreProject && selectedProject && (
        <InlineConfirmation titleId="restore-project-title" title={<>Restore all {parkedLinkCount} links from {selectedProject.name}?</>}
          className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3.5 wrap-anywhere" titleClassName="font-semibold text-blue-950"
          returnFocus={() => restoreTrigger.current ?? sectionHeading.current}>
          <p className="mt-1 text-sm text-blue-900">
            This includes parked links hidden by the filter. {parkedCopyPreference}
          </p>
          {parkedLinkCount > 20 && (
            <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-900">
              This is a large project and will open many tabs at once.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${defaultRestoreMode === 'normal' ? 'bg-blue-700' : 'bg-slate-700'}`} disabled={isRestoringProject} onClick={() => void handleRestoreProject('normal')}>
              {isRestoringProject ? 'Restoring…' : `Load tabs immediately${defaultRestoreMode === 'normal' ? ' · Default' : ''}`}
            </button>
            <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${defaultRestoreMode === 'unloaded' ? 'bg-blue-700' : 'bg-slate-700'}`} disabled={isRestoringProject} onClick={() => void handleRestoreProject('unloaded')}>
              {isRestoringProject ? 'Restoring…' : `Load tabs when selected${defaultRestoreMode === 'unloaded' ? ' · Default' : ''}`}
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold" disabled={isRestoringProject} onClick={() => setIsConfirmingRestoreProject(false)}>Cancel</button>
          </div>
        </InlineConfirmation>
      )}

      {isRenaming && (
        <InlineConfirmation titleId="rename-project-title" title="Rename project" className="mb-3 rounded-xl border border-slate-200 bg-white p-3.5"
          returnFocus={() => projectActionsTrigger.current?.disabled ? sectionHeading.current : projectActionsTrigger.current}>
          <form onSubmit={saveRename}>
          <label className="sr-only" htmlFor="rename-project">Project name</label>
          <input id="rename-project" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={renameName} onChange={(event) => setRenameName(event.target.value)} />
          <div className="mt-3 flex justify-end gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={isSavingRename} onClick={() => setIsRenaming(false)}>Cancel</button><button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={isSavingRename}>{isSavingRename ? 'Saving...' : 'Save name'}</button></div>
        </form>
        </InlineConfirmation>
      )}

      {isConfirmingDelete && selectedProject && (
        <InlineConfirmation titleId="delete-project-title" title={<>Delete “{selectedProject.name}”?</>}
          className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3.5 wrap-anywhere" titleClassName="font-semibold text-red-900"
          returnFocus={() => projectActionsTrigger.current?.disabled ? sectionHeading.current : projectActionsTrigger.current}>
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
      {!isLoading && !error && groups.length === 0 && <EmptyState title="This project is empty">Park tabs into this project to save them here.</EmptyState>}
      {!isLoading && !error && groups.length > 0 && visibleGroups.length === 0 && <EmptyState title="No matching tabs">Clear the project filter or try a different title, URL, domain, or note.</EmptyState>}
      {visibleGroups.length > 0 && <>
        <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-slate-200 pb-1">
          <h3 className="text-sm font-semibold text-slate-800">Sessions</h3>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={`${toolbarButton} text-blue-700 hover:bg-blue-50`} onClick={() => setAllSessions(true)}>Expand all</button>
            <button type="button" className={`${toolbarButton} text-blue-700 hover:bg-blue-50`} onClick={() => setAllSessions(false)}>Collapse all</button>
          </div>
        </div>
        <p id="session-restore-scope" className="sr-only">Opens all parked links in this session and loads them normally. {parkedCopyPreference}</p>
      </>}
      <div className="divide-y divide-slate-200">
        {visibleGroups.map((group) => {
          const isExpanded = expandedSessionIds.has(group.session.id);
          const limit = sessionLimits[group.session.id] ?? PROJECT_LINK_BATCH_SIZE;
          const shownLinks = visibleProjectLinks(group, limit);
          const sessionCount = sessionCounts.get(group.session.id) ?? group.links.length;
          return (
          <section key={group.session.id} className={density === 'compact' ? 'py-1.5' : 'py-2.5'}>
            <div className="flex items-start justify-between gap-2">
                <button ref={group.session.id === target?.sessionId ? targetButton : undefined} type="button"
                  className="flex min-h-10 min-w-0 flex-1 items-start gap-1.5 rounded text-left"
                  aria-expanded={isExpanded} onClick={() => toggleSession(group.session.id)}>
                  <span aria-hidden="true" className="text-slate-600">{isExpanded ? '▾' : '▸'}</span>
                  <span className="min-w-0">
                    <span className="sr-only">Parking session </span>
                    <span className="block text-sm font-semibold">{formatLinkDate(group.session.createdAt)}</span>
                    <span className="block text-xs text-slate-600">{sessionCount !== group.links.length && `${group.links.length} of `}{sessionCount} parked link{sessionCount === 1 ? '' : 's'}</span>
                    {group.session.reminderAt && <span className="mt-1 block text-xs font-semibold text-amber-700">Reminder {formatLinkDate(group.session.reminderAt)}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  className="min-h-10 shrink-0 whitespace-nowrap rounded-lg border border-blue-200 bg-white px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  disabled={restoring || managingProject || isLoading || isCreating}
                  aria-describedby="session-restore-scope"
                  onClick={() => void handleRestoreSession(group.session.id)}
                >
                  {restoringSessionId === group.session.id ? 'Restoring...' : 'Restore session'}
                </button>
            </div>
            {isExpanded && <div className="mt-2 space-y-2">
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
