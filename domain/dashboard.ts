import type { Project, SavedLink } from './schemas';

export interface DashboardProjectCount {
  project: Project;
  count: number;
}

export interface DashboardSummary {
  /** Parked links waiting for a decision. */
  toReview: number;
  /** Links whose reminder has come due. */
  dueReminders: number;
  archived: number;
  /** Creation time of the longest-waiting parked link, if any. */
  oldestWaitingSince?: string;
  /** Projects with at least one parked link, busiest first; the rest are left out. */
  projects: DashboardProjectCount[];
}

/** Everything the Manager Home page shows, worked out from lists the worker already returns. */
export function summarizeDashboard(input: {
  parked: readonly SavedLink[];
  archived: readonly SavedLink[];
  due: readonly SavedLink[];
  projects: readonly Project[];
}): DashboardSummary {
  const counts = new Map<string, number>();
  let oldest: string | undefined;
  for (const link of input.parked) {
    counts.set(link.projectId, (counts.get(link.projectId) ?? 0) + 1);
    if (!oldest || link.createdAt < oldest) oldest = link.createdAt;
  }
  const projects = input.projects
    .map(project => ({ project, count: counts.get(project.id) ?? 0 }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.project.name.localeCompare(b.project.name));
  return {
    toReview: input.parked.length,
    dueReminders: input.due.length,
    archived: input.archived.length,
    ...(oldest ? { oldestWaitingSince: oldest } : {}),
    projects,
  };
}

/** "today", "1 day", "12 days", "3 months": how long ago, for a quiet line of context. */
export function describeWaiting(since: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000));
  if (days === 0) return 'today';
  if (days < 60) return days === 1 ? '1 day' : `${days} days`;
  const months = Math.floor(days / 30);
  return months < 24 ? `${months} months` : `${Math.floor(months / 12)} years`;
}

/** "today", "1 day ago", "3 months ago". */
export function describeAgo(since: string, now: Date): string {
  const waited = describeWaiting(since, now);
  return waited === 'today' ? waited : `${waited} ago`;
}

export interface RecentSession {
  id: string;
  projectName: string;
  linkCount: number;
  firstTitle: string;
  createdAt: string;
}

/** The newest parked sessions that still have links, for quick recognition. */
export function recentSessions(
  groups: ReadonlyArray<{ session: { id: string; projectId: string; createdAt: string }; links: ReadonlyArray<{ title: string }> }>,
  projects: readonly Project[],
  limit = 3,
): RecentSession[] {
  const names = new Map(projects.map(project => [project.id, project.name]));
  return groups
    .filter(group => group.links.length > 0)
    .sort((a, b) => b.session.createdAt.localeCompare(a.session.createdAt))
    .slice(0, limit)
    .map(group => ({
      id: group.session.id,
      projectName: names.get(group.session.projectId) ?? 'Unknown project',
      linkCount: group.links.length,
      firstTitle: group.links[0].title,
      createdAt: group.session.createdAt,
    }));
}
