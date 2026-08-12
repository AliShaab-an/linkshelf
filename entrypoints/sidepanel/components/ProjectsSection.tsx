import { useEffect, useState, type FormEvent } from 'react';
import { INBOX_PROJECT_ID } from '@/domain/constants';
import type { Project, SavedLink } from '@/domain/schemas';
import {
  archiveLink,
  createProject,
  deleteProject,
  getParkedSessionGroups,
  getProjects,
  renameProject,
  removeLink,
  restoreLink,
  restoreProject,
  restoreSession,
  type ParkedSessionGroup,
} from '@/messaging/contracts';
import { formatLinkDate, SavedLinkCard } from './SavedLinkCard';
import { RemoveLinkDialog } from './RemoveLinkDialog';
import { EmptyState, SkeletonCards } from './ui/Feedback';

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((first, second) => {
    if (first.isInbox !== second.isInbox) return first.isInbox ? -1 : 1;
    return first.name.localeCompare(second.name);
  });
}

export function ProjectsSection() {
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

  const selectedProject = projects.find((project) => project.id === selectedId);
  const parkedLinkCount = groups.reduce(
    (total, group) => total + group.links.length,
    0,
  );

  useEffect(() => {
    void Promise.all([getProjects(), getParkedSessionGroups(INBOX_PROJECT_ID)])
      .then(([projectsResponse, groupsResponse]) => {
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        if (!groupsResponse.success) throw new Error(groupsResponse.error.message);
        setProjects(projectsResponse.projects);
        setGroups(groupsResponse.groups);
      })
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load projects.'))
      .finally(() => setIsLoading(false));
  }, []);

  async function selectProject(projectId: string) {
    if (projectId === selectedId) return;
    setSelectedId(projectId);
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setIsRenaming(false);
    setIsConfirmingDelete(false);
    setIsConfirmingRestoreProject(false);
    try {
      const response = await getParkedSessionGroups(projectId);
      if (!response.success) throw new Error(response.error.message);
      setGroups(response.groups);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load links.');
    } finally {
      setIsLoading(false);
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
      setProjects((current) => sortProjects([...current, response.project]));
      setSelectedId(response.project.id);
      setGroups([]);
      setNewName('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not create the project.');
    } finally {
      setIsCreating(false);
    }
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
      setSelectedId(response.inboxProjectId);
      const groupsResponse = await getParkedSessionGroups(response.inboxProjectId);
      if (!groupsResponse.success) throw new Error(groupsResponse.error.message);
      setGroups(groupsResponse.groups);
      setIsConfirmingDelete(false);
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
      setGroups((current) =>
        current
          .map((group) => ({
            ...group,
            links: group.links.filter((link) => link.id !== linkId),
          }))
          .filter((group) => group.links.length > 0),
      );
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
        response.complete
          ? `Restored all ${response.restoredLinkIds.length} links from the session.`
          : `Restored ${response.restoredLinkIds.length} links. Chrome could not open ${response.failedLinkIds.length}, so they remain parked.`,
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

  async function handleRestoreProject() {
    if (!selectedProject || parkedLinkCount === 0 || isRestoringProject) return;
    setIsRestoringProject(true);
    setError(null);
    setMessage(null);
    try {
      const response = await restoreProject(selectedProject.id);
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
        response.complete
          ? `Restored all ${response.restoredLinkIds.length} links from ${selectedProject.name}.`
          : `Restored ${response.restoredLinkIds.length} links. Chrome could not open ${response.failedLinkIds.length}, so they remain parked.`,
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

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3.5">
        <h2 className="font-semibold">Projects</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {projects.map((project) => (
            <button key={project.id} type="button" className={project.id === selectedId ? 'rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white' : 'rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700'} onClick={() => void selectProject(project.id)}>
              {project.name}
            </button>
          ))}
        </div>
        <form className="mt-4 border-t border-slate-200 pt-3" onSubmit={addProject}>
          <label className="text-sm font-semibold" htmlFor="new-project">New project</label>
          <div className="mt-2 flex gap-2">
            <input id="new-project" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!newName.trim() || isCreating}>{isCreating ? 'Adding...' : 'Add'}</button>
          </div>
        </form>
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-slate-500">Selected project</p><h2 className="mt-1 text-lg font-bold">{selectedProject?.name ?? 'Inbox'}</h2></div>
        <div className="flex flex-wrap justify-end gap-2">
          {parkedLinkCount > 0 && (
            <button type="button" className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white" onClick={() => { setIsConfirmingRestoreProject(true); setIsConfirmingDelete(false); setIsRenaming(false); }}>
              Restore all
            </button>
          )}
          {selectedProject && !selectedProject.isInbox && (
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
            Restore all {parkedLinkCount} links from {selectedProject.name}?
          </h3>
          <p className="mt-1 text-sm text-blue-900">
            Chrome will open every parked link across {groups.length} session{groups.length === 1 ? '' : 's'}.
          </p>
          {parkedLinkCount > 20 && (
            <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-900">
              This is a large project and will open many tabs at once.
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold" disabled={isRestoringProject} onClick={() => setIsConfirmingRestoreProject(false)}>Cancel</button>
            <button type="button" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={isRestoringProject} onClick={() => void handleRestoreProject()}>
              {isRestoringProject ? 'Restoring project...' : `Open ${parkedLinkCount} tabs`}
            </button>
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
      {!isLoading && !error && groups.length === 0 && <EmptyState title="This project is empty">Park tabs into {selectedProject?.name ?? 'this project'} to start a focused workspace.</EmptyState>}
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.session.id} className="rounded-2xl border border-slate-300 bg-slate-100 p-3">
            <div className="mb-3 rounded-xl bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Parking session</p>
                  <h3 className="mt-1 font-semibold">{formatLinkDate(group.session.createdAt)}</h3>
                  <p className="mt-1 text-sm text-slate-500">{group.links.length} parked link{group.links.length === 1 ? '' : 's'}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={restoringSessionId !== null || restoringId !== null || isRestoringProject}
                  onClick={() => void handleRestoreSession(group.session.id)}
                >
                  {restoringSessionId === group.session.id ? 'Restoring...' : 'Restore session'}
                </button>
              </div>
              {group.session.note && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{group.session.note}</p>}
              {group.session.reminderAt && <p className="mt-2 text-xs font-semibold text-amber-700">Reminder {formatLinkDate(group.session.reminderAt)}</p>}
            </div>
            <div className="space-y-2">
              {group.links.map((link) => (
                <SavedLinkCard
                  key={link.id}
                  link={link}
                  isRestoring={restoringId === link.id || restoringSessionId === group.session.id || isRestoringProject || lifecycleWorkingId === link.id}
                  onRestore={() => void handleRestore(link.id)}
                  onArchive={() => void handleArchive(link)}
                  onRemove={() => setRemoveCandidate(link)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
