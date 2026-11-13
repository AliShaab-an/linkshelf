import { describeLinkRestore } from '../restore-feedback';
import { OperationFeedback } from './ui/OperationFeedback';
import { useEffect, useState } from 'react';
import type { Project, SavedLink } from '@/domain/schemas';
import {
  getDueReminderLinks,
  getProjects,
  restoreLink,
} from '@/messaging/contracts';
import { SavedLinkCard } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';

export function TodaySection() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getDueReminderLinks(), getProjects()])
      .then(([linksResponse, projectsResponse]) => {
        if (!linksResponse.success) {
          setError(linksResponse.error.message);
          return;
        }
        if (!projectsResponse.success) {
          setError(projectsResponse.error.message);
          return;
        }
        setWarnings(linksResponse.warnings ?? []);
        setLinks(linksResponse.links);
        setProjects(projectsResponse.projects);
      })
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load reminders.'),
      )
      .finally(() => setIsLoading(false));
  }, []);

  async function handleRestore(linkId: string) {
    setWarnings([]);
    setRestoringId(linkId);
    setError(null);
    setMessage(null);
    try {
      const response = await restoreLink(linkId);
      setWarnings(response.warnings ?? []);
      if (!response.success) {
        setError(describeLinkRestore(response));
        return;
      }
      if (response.restored) {
        setLinks((current) => current.filter((link) => link.id !== linkId));
      }
      setMessage(describeLinkRestore(response));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not restore this link.');
    } finally {
      setRestoringId(null);
    }
  }

  const feedback = <OperationFeedback pending={restoringId ? 'Restoring link…' : undefined} message={message} error={error} warnings={warnings} />;

  return (
    <>
      {feedback}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Due and overdue</p>
        <h2 className="mt-1 text-lg font-bold">Today</h2>
        <p className="mt-1 text-sm text-slate-500">Reminders stay here until you restore or organize their links.</p>
      </div>
      {isLoading && <SkeletonCards count={2} />}
      {!isLoading && !error && links.length === 0 && (
        <EmptyState title="Nothing due">Links appear here when their reminder time arrives. Enjoy the clear runway.</EmptyState>
      )}
      <div className="space-y-3">
        {links.map((link) => (
          <SavedLinkCard
            key={link.id}
            link={link}
            projectName={projects.find((project) => project.id === link.projectId)?.name ?? 'Unknown project'}
            isDue
            isRestoring={restoringId === link.id}
            onRestore={() => void handleRestore(link.id)}
          />
        ))}
      </div>
    </>
  );
}
