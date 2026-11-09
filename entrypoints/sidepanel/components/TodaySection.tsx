import { useEffect, useState } from 'react';
import type { Project, SavedLink } from '@/domain/schemas';
import {
  getDueReminderLinks,
  getProjects,
  restoreLink,
} from '@/messaging/contracts';
import { SavedLinkCard } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { DATABASE_STORAGE_KEY } from '@/storage/repository';

export function TodaySection() {
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let requestVersion = 0;
    function refresh() {
      const request = ++requestVersion;
      void Promise.all([getDueReminderLinks(), getProjects()])
      .then(([linksResponse, projectsResponse]) => {
        if (disposed || request !== requestVersion) return;
        if (!linksResponse.success) {
          setError(linksResponse.error.message);
          return;
        }
        if (!projectsResponse.success) {
          setError(projectsResponse.error.message);
          return;
        }
        setLinks(linksResponse.links);
        setProjects(projectsResponse.projects);
        setError(null);
      })
      .catch((caughtError) => { if (!disposed && request === requestVersion) setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not load reminders.'); })
      .finally(() => { if (!disposed && request === requestVersion) setIsLoading(false); });
    }
    function onChange(changes: Record<string, Browser.storage.StorageChange>, area: string) {
      if (area === 'local' && changes[DATABASE_STORAGE_KEY]) refresh();
    }
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    browser.storage.onChanged.addListener(onChange);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      browser.storage.onChanged.removeListener(onChange);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  async function handleRestore(linkId: string) {
    setRestoringId(linkId);
    setError(null);
    try {
      const response = await restoreLink(linkId);
      if (!response.success) {
        setError(response.error.message);
        return;
      }
      if (response.restored) {
        setLinks((current) => current.filter((link) => link.id !== linkId));
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not restore this link.');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Due and overdue</p>
        <h2 className="mt-1 text-lg font-bold">Due today</h2>
        <p className="mt-1 text-sm text-slate-500">Reopen a link to return to it. Reminders stay here while the links remain parked.</p>
      </div>
      {isLoading && <SkeletonCards count={2} />}
      {error && <p className="mb-3 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {!isLoading && !error && links.length === 0 && (
        <EmptyState title="Nothing due">To add a reminder, choose Park tabs, select your tabs, then open Add note or reminder before saving.</EmptyState>
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
