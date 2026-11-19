import { InlineConfirmation } from './ui/InlineConfirmation';
import { OperationFeedback } from './ui/OperationFeedback';
import { withSecondaryWarning } from '@/features/operations/secondary-result';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
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
  moveLink,
  renameProject,
  removeLink,
  restoreLink,
  restoreProject,
  restoreSession,
  patchSettings,
  undoParkedLink,
  type ParkedSessionGroup,
  type UndoParkedLinkMessage,
} from '@/messaging/contracts';
import { formatLinkDate, LinkFavicon, NotePreview, SavedLinkCard } from './SavedLinkCard';
import { MoveLinkDialog } from './MoveLinkDialog';
import { TagLinkDialog } from './TagLinkDialog';
import { ReminderLinkDialog } from './ReminderLinkDialog';
import { TagFilterBar } from './ui/TagFilterBar';
import { hasActiveModal } from './ui/Modal';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { Disclosure } from './ui/Disclosure';
import { Icon } from './ui/Icon';
import { Select } from './ui/Select';
import {
  collectTagCounts,
  filterAndSortProjectGroups,
  groupSessionsByDay,
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
const inboxActions = { reason: 'Inbox can’t be renamed or deleted.', descriptionId: 'inbox-project-actions-help' };

export function ProjectsSection({ savedSession, onPark }: {
  savedSession?: SavedSessionTarget;
  onPark(projectId: string): void;
}) {
  const target = useRef(savedSession).current;
  const targetButton = useRef<HTMLButtonElement>(null);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const projectSelector = useRef<HTMLSelectElement>(null);
  const projectFilter = useRef<HTMLInputElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const sessions = useRef<HTMLDivElement>(null);
  const restoreRowFocus = useRef<number | null>(null);
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
  const [undo, setUndo] = useState<UndoParkedLinkMessage['payload']>();
  const [isUndoing, setIsUndoing] = useState(false);
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
  const [moveCandidate, setMoveCandidate] = useState<SavedLink | null>(null);
  const [tagCandidate, setTagCandidate] = useState<SavedLink | null>(null);
  const [reminderCandidate, setReminderCandidate] = useState<SavedLink | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [moveDestination, setMoveDestination] = useState('');
  const [filter, setFilter] = useState('');
  const [sessionOrder, setSessionOrder] = useState<SessionOrder>('newest');
  const [groupByDay, setGroupByDay] = useState(true);
  const [density, setDensity] = useState<DisplayDensity>('comfortable');
  const [defaultRestoreMode, setDefaultRestoreMode] = useState<RestoreMode>('normal');
  const [chosenRestoreMode, setChosenRestoreMode] = useState<RestoreMode>();
  const [restoreBehavior, setRestoreBehavior] = useState<Settings['defaultRestoreBehavior']>('restore-and-remove');
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [filteredExpansion, setFilteredExpansion] = useState<Set<string> | null>(null);
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
  const tagCounts = useMemo(() => collectTagCounts(groups), [groups]);
  const activeTag = tagFilter && tagCounts.some(({ tag }) => tag === tagFilter) ? tagFilter : null;
  const visibleGroups = useMemo(
    () => filterAndSortProjectGroups(groups, filter, sessionOrder, activeTag ?? undefined),
    [groups, filter, sessionOrder, activeTag],
  );
  const visibleDays = useMemo(() => groupByDay ? groupSessionsByDay(visibleGroups, sessionOrder)
    : [{ key: 'all', label: null, sessions: visibleGroups }], [groupByDay, sessionOrder, visibleGroups]);
  const visibleLinkCount = visibleGroups.reduce(
    (total, group) => total + group.links.length,
    0,
  );
  const sessionCounts = useMemo(() => new Map(groups.map(({ session, links }) => [session.id, links.length])), [groups]);
  const filtering = Boolean(filter.trim()) || activeTag !== null;
  const hiddenLinkCount = parkedLinkCount - visibleLinkCount;
  const activeExpansion = filtering ? filteredExpansion : expandedSessionIds;
  const moveProjects = projects.filter(project => project.id !== moveCandidate?.projectId);

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
        setGroupByDay(uiState.groupSessionsByDay);
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

  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const style = document.documentElement.style;
    const measure = () => style.setProperty('--saved-toolbar-height', `${element.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => {
      observer.disconnect();
      style.removeProperty('--saved-toolbar-height');
    };
  }, []);

  useEffect(() => {
    function focusFilter(event: globalThis.KeyboardEvent) {
      if (event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || hasActiveModal()) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select, [role="textbox"]'))) return;
      event.preventDefault();
      projectFilter.current?.focus();
    }
    document.addEventListener('keydown', focusFilter);
    return () => document.removeEventListener('keydown', focusFilter);
  }, []);

  useLayoutEffect(() => {
    if (restoreRowFocus.current === null) return;
    const index = restoreRowFocus.current;
    restoreRowFocus.current = null;
    if (document.activeElement !== document.body) return;
    const rows = sessions.current?.querySelectorAll<HTMLElement>('[data-saved-row]');
    (rows?.[Math.min(index, rows.length - 1)] ?? projectFilter.current)?.focus();
  }, [groups]);

  function navigateRows(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.defaultPrevented || !(event.target instanceof HTMLElement) || event.target.closest('[role="group"]')) return;
    const current = event.target.closest('[data-saved-row]');
    if (!current) return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-saved-row]'));
    const next = rows[rows.indexOf(current as HTMLElement) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

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

  function changeFilter(value: string) {
    setFilter(value);
    setSessionLimits({});
    setFilteredExpansion(null);
  }

  async function selectProject(projectId: string) {
    if (projectId === selectedId) return;
    setSelectedId(projectId);
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setUndo(undefined);
    setIsAddingProject(false);
    setIsRenaming(false);
    setIsConfirmingDelete(false);
    setIsConfirmingRestoreProject(false);
    changeFilter('');
    setTagFilter(null);
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
      setUndo(undefined);
      setSelectedId(response.project.id);
      setGroups([]);
      setExpandedSessionIds(new Set());
      rememberView({ selectedProjectId: response.project.id, expandedSessionIds: [] });
      setNewName('');
      changeFilter('');
      setTagFilter(null);
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
    if (filtering) {
      const next = new Set(filteredExpansion ?? visibleGroups.map(group => group.session.id));
      if (!next.delete(sessionId)) next.add(sessionId);
      setFilteredExpansion(next);
      return;
    }
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
    setSessionLimits({});
    if (filtering) setFilteredExpansion(next);
    else {
      setExpandedSessionIds(next);
      rememberView({ expandedSessionIds: [...next] });
    }
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
      setUndo(undefined);
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

  async function handleRestore(link: SavedLink, behavior?: 'restore-and-remove') {
    if (isUndoing || restoring || lifecycleWorkingId) return;
    const row = document.activeElement?.closest('[data-saved-row]');
    const rows = Array.from(sessions.current?.querySelectorAll('[data-saved-row]') ?? []);
    setWarnings([]);
    setPartialRestore(false);
    setMessage(null);
    setRestoringId(link.id);
    setError(null);
    try {
      const response = await restoreLink(link.id, { undoable: true, ...(behavior ? { behavior } : {}) });
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(describeLinkRestore(response));
      if (response.restored) {
        if (row && rows.includes(row)) restoreRowFocus.current = rows.indexOf(row);
        removeLinkFromGroups(link.id);
        if (response.restoredAt) {
          setUndo({ linkId: link.id, projectId: link.projectId, sessionId: link.sessionId, updatedAt: response.restoredAt, status: 'restored' });
        } else setMessage(describeLinkRestore(response));
      } else setMessage(describeLinkRestore(response));
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
      setUndo({ linkId: link.id, projectId: response.link.projectId, sessionId: response.link.sessionId,
        updatedAt: response.link.updatedAt, status: 'removed' });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not remove this link.');
    } finally {
      setLifecycleWorkingId(null);
      setDialogPending(false);
    }
  }

  function startMoving(link: SavedLink) {
    setMessage(null);
    setError(null);
    setWarnings([]);
    setPartialRestore(false);
    setMoveDestination(projects.find(project => project.id !== link.projectId)?.id ?? '');
    setMoveCandidate(link);
  }

  function startTagging(link: SavedLink) {
    setMessage(null);
    setError(null);
    setWarnings([]);
    setPartialRestore(false);
    setTagCandidate(link);
  }

  function startReminding(link: SavedLink) {
    setMessage(null);
    setError(null);
    setWarnings([]);
    setPartialRestore(false);
    setReminderCandidate(link);
  }

  function finishReminding(updated: SavedLink, change: 'set' | 'cleared', savedWarnings: string[]) {
    setGroups((current) => current.map((group) => ({
      ...group,
      links: group.links.map((link) => link.id === updated.id ? updated : link),
    })));
    setReminderCandidate(null);
    setWarnings(savedWarnings);
    setMessage(change === 'cleared' ? `Cleared the reminder for “${updated.title}”.` : `Reminder set for “${updated.title}”.`);
  }

  function finishTagging(updated: SavedLink) {
    setGroups((current) => current.map((group) => ({
      ...group,
      links: group.links.map((link) => link.id === updated.id ? updated : link),
    })));
    setTagCandidate(null);
    setMessage(updated.tags?.length ? `Saved tags for “${updated.title}”.` : `Removed tags from “${updated.title}”.`);
  }

  async function confirmMove() {
    if (dialogPending || !moveCandidate || !moveDestination) return;
    setDialogPending(true);
    setError(null);
    setWarnings([]);
    try {
      const response = await moveLink(moveCandidate.id, moveDestination);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      removeLinkFromGroups(moveCandidate.id);
      const destination = moveProjects.find(project => project.id === response.link.projectId)?.name;
      setMessage(destination ? `Moved “${moveCandidate.title}” to ${destination}.` : `Moved “${moveCandidate.title}”.`);
      setMoveCandidate(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LinkShelf could not move this link.');
    } finally { setDialogPending(false); }
  }

  async function handleUndo() {
    if (!undo || isUndoing || restoring || lifecycleWorkingId || dialogPending || isLoading) return;
    setIsUndoing(true);
    setMessage(null);
    setError(null);
    setWarnings([]);
    try {
      const response = await undoParkedLink(undo);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      setUndo(undefined);
      const refreshed = await withSecondaryWarning(response, async () => {
        const result = await getParkedSessionGroups(selectedId);
        if (!result.success) throw new Error(result.error.message);
        setGroups(result.groups);
        setExpandedSessionIds(current => new Set([...current, response.link.sessionId]));
      }, 'The link was returned to Saved. Reopen this project to refresh the list.');
      setWarnings(refreshed.warnings ?? []);
      setMessage('Link returned to Saved.');
      projectFilter.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not undo this action.');
    } finally { setIsUndoing(false); }
  }

  const managingProject = isDeleting || isRestoringProject || isSavingRename || isUndoing;
  const restoring = isRestoringProject || restoringSessionId !== null || restoringId !== null;
  const parkedCopyPreference = restoreBehavior === 'open-copy'
    ? 'Opened links stay parked.'
    : 'Successfully restored links leave the parked list.';
  const feedback = { pending: isDeleting ? 'Moving links to Inbox…' : isRestoringProject || restoringSessionId || restoringId ? 'Restoring links…' : isCreating || isSavingRename ? 'Saving project…' : lifecycleWorkingId ? 'Updating link…' : undefined, message, error, warnings, partial: partialRestore };

  return (
    <>
      <OperationFeedback {...(!(removeCandidate || moveCandidate) ? feedback : {})} />
      <h2 ref={sectionHeading} tabIndex={-1} className="mb-2 text-lg font-bold">Saved</h2>
      <div ref={toolbar} className={`projects-toolbar relative z-20 mb-3 grid grid-cols-1 gap-2 ${isAddingProject || isConfirmingRestoreProject || isRenaming || isConfirmingDelete ? '' : 'projects-toolbar-sticky'}`}>
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
            unavailable={selectedProject?.isInbox ? inboxActions : undefined}
            disabled={!selectedProject || managingProject || restoring || isCreating || isLoading}>
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
        {selectedProject?.isInbox && <p id={inboxActions.descriptionId} className="text-xs text-slate-700">{inboxActions.reason}</p>}

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
          <input ref={projectFilter} id="project-filter" type="search" aria-keyshortcuts="/" title="Press / to focus the project filter"
            className="saved-project-filter min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
            placeholder="Filter this project" value={filter} onChange={(event) => changeFilter(event.target.value)} />
          <Disclosure label="View options" triggerContent={<>View <span aria-hidden="true">▾</span></>}>
            {close => <>
              <label className="grid gap-1 px-1 py-1 text-xs font-semibold text-slate-700">
                Session order
                <Select value={sessionOrder} onChange={(event) => setOrder(event.target.value as SessionOrder)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Link title A–Z{groupByDay ? ' within each day' : ''}</option>
                </Select>
              </label>
              <label className="grid gap-1 px-1 py-1 text-xs font-semibold text-slate-700">
                Group sessions
                <Select value={groupByDay ? 'day' : 'none'} onChange={event => {
                  const byDay = event.target.value === 'day';
                  setGroupByDay(byDay);
                  rememberView({ groupSessionsByDay: byDay });
                }}>
                  <option value="day">By day</option><option value="none">No grouping</option>
                </Select>
              </label>
              <label className="grid gap-1 px-1 py-1 text-xs font-semibold text-slate-700">
                Saved link spacing
                <Select value={density} onChange={(event) => void changeDensity(event.target.value as DisplayDensity)}>
                  <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
                </Select>
              </label>
              {visibleGroups.length > 0 && <div className="border-t border-slate-200 pt-1">
                <button type="button" className="dropdown-action" onClick={() => { setAllSessions(true); close(); }}>Expand all</button>
                <button type="button" className="dropdown-action" onClick={() => { setAllSessions(false); close(); }}>Collapse all</button>
              </div>}
            </>}
          </Disclosure>
        </div>
        {parkedLinkCount > 0 && <div className="flex min-h-10 items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {filtering
              ? <><strong>{visibleLinkCount}</strong> {visibleLinkCount === 1 ? 'link' : 'links'} shown</>
              : <><strong>{parkedLinkCount}</strong> parked {parkedLinkCount === 1 ? 'link' : 'links'}</>}
            {visibleGroups.length > 0 && <> · <strong>{visibleGroups.length}</strong> {visibleGroups.length === 1 ? 'session' : 'sessions'}</>}
          </p>
          <button ref={restoreTrigger} type="button" aria-describedby="project-restore-scope"
            disabled={managingProject || restoring || isLoading || isCreating}
            className={`${toolbarButton} bg-blue-700 text-white hover:bg-blue-800`}
            onClick={() => {
              setChosenRestoreMode(undefined);
              setIsConfirmingRestoreProject(true);
              setIsAddingProject(false);
              setIsConfirmingDelete(false);
              setIsRenaming(false);
            }}>Restore all ({parkedLinkCount})</button>
          <p id="project-restore-scope" className="sr-only">Opens all {parkedLinkCount} parked links in this project, including links hidden by the filter. {parkedCopyPreference}</p>
        </div>}
      </div>

      {isConfirmingRestoreProject && selectedProject && parkedLinkCount > 0 && (
        <InlineConfirmation titleId="restore-project-title" title={<>Restore all {parkedLinkCount} {parkedLinkCount === 1 ? 'link' : 'links'} from {selectedProject.name}?</>}
          className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3.5 wrap-anywhere" titleClassName="font-semibold text-blue-950"
          returnFocus={() => restoreTrigger.current ?? sectionHeading.current}>
          <p className="mt-1 text-sm text-blue-900">
            {hiddenLinkCount > 0 && `This includes ${hiddenLinkCount} ${hiddenLinkCount === 1 ? 'link' : 'links'} hidden by the filter. `}{parkedCopyPreference}
          </p>
          {parkedLinkCount > 20 && (
            <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-900">
              This is a large project and will open many tabs at once.
            </p>
          )}
          <label className="mt-3 block text-sm font-medium text-blue-950" htmlFor="restore-load-mode">When to load tabs</label>
          <Select id="restore-load-mode" className="mt-1 w-full" value={chosenRestoreMode ?? defaultRestoreMode} disabled={isRestoringProject}
            onChange={event => setChosenRestoreMode(event.target.value as RestoreMode)}>
            <option value="normal">Immediately{defaultRestoreMode === 'normal' ? ' · Default' : ''}</option>
            <option value="unloaded">When selected{defaultRestoreMode === 'unloaded' ? ' · Default' : ''}</option>
          </Select>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className={`${toolbarButton} border border-blue-300 bg-white`} disabled={isRestoringProject} onClick={() => setIsConfirmingRestoreProject(false)}>Cancel</button>
            <button type="button" className={`${toolbarButton} bg-blue-700 text-white hover:bg-blue-800`} disabled={isRestoringProject}
              onClick={() => void handleRestoreProject(chosenRestoreMode ?? defaultRestoreMode)}>
              {isRestoringProject ? 'Restoring…' : `Restore ${parkedLinkCount} ${parkedLinkCount === 1 ? 'tab' : 'tabs'}`}
            </button>
          </div>
        </InlineConfirmation>
      )}

      {isRenaming && (
        <InlineConfirmation titleId="rename-project-title" title="Rename project" className="mb-3 rounded-xl border border-slate-200 bg-white p-3.5"
          returnFocus={() => projectActionsTrigger.current?.matches(':disabled, [aria-disabled="true"]') ? sectionHeading.current : projectActionsTrigger.current}>
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
          returnFocus={() => projectActionsTrigger.current?.matches(':disabled, [aria-disabled="true"]') ? sectionHeading.current : projectActionsTrigger.current}>
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
      {tagCandidate && (
        <TagLinkDialog link={tagCandidate} suggestions={tagCounts.map(({ tag }) => tag)}
          returnFocus={(invoker) => invoker ?? projectFilter.current ?? sectionHeading.current}
          onSaved={finishTagging} onCancel={() => setTagCandidate(null)} />
      )}
      {reminderCandidate && (
        <ReminderLinkDialog link={reminderCandidate} snooze={false}
          returnFocus={(invoker) => invoker ?? projectFilter.current ?? sectionHeading.current}
          onSaved={finishReminding} onCancel={() => setReminderCandidate(null)} />
      )}
      {moveCandidate && (
        <MoveLinkDialog link={moveCandidate} projects={moveProjects} selectedProjectId={moveDestination}
          feedback={<OperationFeedback {...feedback} pending={dialogPending ? 'Moving link…' : undefined} />}
          returnFocus={(invoker) => invoker ?? projectFilter.current ?? sectionHeading.current}
          isMoving={dialogPending} onSelect={setMoveDestination} onCancel={() => setMoveCandidate(null)}
          onConfirm={() => void confirmMove()} />
      )}

      {!isLoading && !error && tagCounts.length > 0 && <TagFilterBar tags={tagCounts} selected={activeTag ? [activeTag] : []}
        onToggle={(tag) => { setSessionLimits({}); setFilteredExpansion(null); setTagFilter(activeTag === tag ? null : tag); }} />}
      {isLoading && <SkeletonCards count={2} />}
      {!isLoading && !error && groups.length === 0 && selectedProject && <EmptyState title="Nothing saved yet">
        <p>Park a tab to get started.</p>
        <button type="button" className={`${toolbarButton} mt-2 bg-blue-700 text-white hover:bg-blue-800`} onClick={() => onPark(selectedProject.id)}>Park tabs</button>
      </EmptyState>}
      {!isLoading && !error && groups.length > 0 && visibleGroups.length === 0 && <EmptyState title="No matching tabs">
        <button type="button" className={`${toolbarButton} text-blue-700 hover:bg-blue-50`} onClick={() => { changeFilter(''); setTagFilter(null); projectFilter.current?.focus(); }}>Clear filter</button>
      </EmptyState>}
      {visibleGroups.length > 0 && <>
        <h3 className="sr-only">Sessions</h3>
        <p id="session-restore-scope" className="sr-only">Opens all parked links in this session and loads them immediately. {parkedCopyPreference}</p>
      </>}
      <div ref={sessions} onKeyDown={navigateRows}>
        {visibleDays.map(day => <div key={day.key} className="divide-y divide-slate-200">
          {day.label && <h3 className="saved-day-heading sticky z-10 rounded-t-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">{day.label}</h3>}
          {day.sessions.map(group => {
            const sessionCount = sessionCounts.get(group.session.id) ?? group.links.length;
            const single = sessionCount === 1;
            const expanded = activeExpansion?.has(group.session.id) ?? true;
            const limit = sessionLimits[group.session.id] ?? PROJECT_LINK_BATCH_SIZE;
            const shownLinks = visibleProjectLinks(group, limit);
            const first = group.links[0];
            const previewNote = first.note ?? group.session.note;
            const isTarget = group.session.id === target?.sessionId;
            return <section key={group.session.id} className={density === 'compact' ? 'py-1.5' : 'py-2.5'}>
              {!single && <div className="flex items-start gap-1">
                <button ref={isTarget ? targetButton : undefined} type="button" data-saved-row
                  className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg p-1.5 text-left hover:bg-slate-100"
                  aria-expanded={expanded} onClick={() => toggleSession(group.session.id)}>
                  <LinkFavicon link={first} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Parking session </span>
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-sm font-semibold" title={first.title} dir="auto">{first.title}</span>
                      {group.links.length > 1 && <span className="shrink-0 text-xs font-medium text-slate-700">+{group.links.length - 1} more</span>}
                    </span>
                    <span className="block text-xs text-slate-700">{formatLinkDate(group.session.createdAt)} · {sessionCount !== group.links.length ? `${group.links.length} of ` : ''}{sessionCount} links</span>
                    {group.session.reminderAt && <span className="mt-1 block text-xs font-semibold text-amber-700">Reminder {formatLinkDate(group.session.reminderAt)}</span>}
                    {!expanded && previewNote && <span className="block truncate text-xs text-slate-600" title={previewNote}>{previewNote}</span>}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-slate-700">{expanded ? '▾' : '▸'}</span>
                </button>
                <button type="button" className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  disabled={restoring || managingProject || isLoading || isCreating}
                  aria-label="Restore session" title="Restore session" aria-describedby="session-restore-scope"
                  onClick={() => void handleRestoreSession(group.session.id)}>
                  <Icon name={restoringSessionId === group.session.id ? 'clock' : 'undo'} className="size-5" />
                </button>
              </div>}
              {!single && expanded && group.session.note && <div className="px-2 pb-2">
                <p className="text-xs font-medium text-slate-700">Session note</p>
                <NotePreview note={group.session.note} />
              </div>}
              {(single || expanded) && <div ref={single && isTarget ? element => {
                targetButton.current = element?.querySelector<HTMLButtonElement>('button[aria-label="Restore link"]') ?? null;
              } : undefined} className={density === 'compact' ? 'divide-y divide-slate-200 rounded-lg border border-slate-200' : 'space-y-2'}>
                {shownLinks.map(link => <SavedLinkCard
                  key={link.id}
                  link={link}
                  note={single ? link.note ?? group.session.note : link.note === group.session.note ? null : link.note}
                  density={density}
                  inSession
                  isRestoring={restoringId === link.id || restoringSessionId === group.session.id || isRestoringProject || lifecycleWorkingId === link.id || isUndoing}
                  onRestore={() => void handleRestore(link)}
                  onRestoreAndRemove={() => void handleRestore(link, 'restore-and-remove')}
                  onArchive={() => void handleArchive(link)}
                  onEditTags={() => startTagging(link)}
                  onRemind={() => startReminding(link)}
                  onMove={projects.length > 1 ? () => startMoving(link) : undefined}
                  onRemove={() => startRemoving(link)}
                />)}
                {shownLinks.length < group.links.length && <div className="flex gap-2 pt-1">
                  <button type="button" className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700"
                    onClick={() => setSessionLimits(current => ({ ...current, [group.session.id]: limit + PROJECT_LINK_BATCH_SIZE }))}>Show {Math.min(PROJECT_LINK_BATCH_SIZE, group.links.length - shownLinks.length)} more</button>
                  <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
                    onClick={() => setSessionLimits(current => ({ ...current, [group.session.id]: group.links.length }))}>Show all</button>
                </div>}
              </div>}
            </section>;
          })}
        </div>)}
      </div>
      {undo && <aside className="sticky bottom-2 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white p-2.5 shadow-lg">
        <p role="status" className="min-w-32 flex-1 text-sm text-slate-800">{undo.status === 'restored' ? 'Tab opened. Undo returns the link to Saved.' : 'Link removed from Saved.'}</p>
        <button type="button" className={`${toolbarButton} text-blue-700 hover:bg-blue-50`} disabled={isUndoing || restoring || !!lifecycleWorkingId}
          onClick={() => void handleUndo()}>{isUndoing ? 'Undoing…' : 'Undo'}</button>
        <button type="button" className={`${toolbarButton} text-slate-700 hover:bg-slate-100`} disabled={isUndoing}
          onClick={() => { projectFilter.current?.focus(); setUndo(undefined); }}>Dismiss</button>
      </aside>}
    </>
  );
}
