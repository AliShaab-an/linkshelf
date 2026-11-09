import { OperationWarnings } from '@/entrypoints/sidepanel/components/ui/OperationWarnings';
import { useEffect, useState } from 'react';
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

export function ArchiveSection() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<SavedLink | null>(null);

  useEffect(() => {
    void Promise.all([getArchivedLinks(), getProjects()])
      .then(([linksResponse, projectsResponse]) => {
        if (!linksResponse.success) throw new Error(linksResponse.error.message);
        if (!projectsResponse.success) throw new Error(projectsResponse.error.message);
        setLinks(linksResponse.links);
        setProjects(projectsResponse.projects);
      })
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load the archive.'))
      .finally(() => setIsLoading(false));
  }, []);

  async function returnToProject(link: SavedLink) {
    setWorkingId(link.id);
    setError(null);
    try {
      const response = await unarchiveLink(link.id);
      setWarnings(response.warnings ?? []);
      if (!response.success) throw new Error(response.error.message);
      setLinks((current) => current.filter((candidate) => candidate.id !== link.id));
      setMessage(`Returned “${link.title}” to its project.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not unarchive this link.');
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmRemove() {
    if (!removeCandidate) return;
    const link = removeCandidate;
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
    }
  }

  return (
    <>
      <OperationWarnings warnings={warnings} />
      <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inactive links</p><h2 className="mt-1 text-lg font-bold">Archive</h2><p className="mt-1 text-sm text-slate-500">Archived links stay local and searchable without cluttering active projects.</p></div>
      {removeCandidate && <RemoveLinkDialog link={removeCandidate} isRemoving={workingId === removeCandidate.id} onCancel={() => setRemoveCandidate(null)} onConfirm={() => void confirmRemove()} />}
      {message && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {isLoading && <SkeletonCards count={2} />}
      {!isLoading && !error && links.length === 0 && <EmptyState title="Archive is empty">Links you archive remain searchable and will appear here.</EmptyState>}
      <div className="space-y-3">
        {links.map((link) => <SavedLinkCard key={link.id} link={link} projectName={projects.find((project) => project.id === link.projectId)?.name} isRestoring={workingId === link.id} onUnarchive={() => void returnToProject(link)} onRemove={() => setRemoveCandidate(link)} />)}
      </div>
    </>
  );
}
