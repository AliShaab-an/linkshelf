import { useCallback, useEffect, useRef, useState } from 'react';
import { describeAgo, describeWaiting, recentSessions, summarizeDashboard, type DashboardSummary, type RecentSession } from '@/domain/dashboard';
import { getArchivedLinks, getAutoBackups, getDueReminderLinks, getParkedLinks, getParkedSessionGroups, getProjects } from '@/messaging/contracts';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { Icon, type IconName } from './ui/Icon';
import { SectionHeader } from './ui/SectionHeader';
import { buttonClass } from './ui/styles';

interface BackupStatus { enabled: boolean; lastAt?: string; problem?: 'space' | 'failed' }

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function Tile({ icon, label, value, detail, href }: { icon: IconName; label: string; value: number; detail: string; href?: string }) {
  const body = <>
    <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <Icon name={icon} className="size-4 text-blue-700" />{label}
    </span>
    <span className="mt-2 block text-3xl font-bold tracking-tight text-slate-900">{value}</span>
    <span className="mt-1 block text-xs text-slate-600">{detail}</span>
  </>;
  const shape = 'block rounded-xl border border-slate-200 bg-white p-4';
  return href
    ? <a href={href} className={`${shape} hover:border-blue-300 hover:bg-blue-50`}>{body}</a>
    : <div className={shape}>{body}</div>;
}

/** The Manager's landing page: where things stand, and a way into the lists that need attention. */
export function HomeSection() {
  const heading = useRef<HTMLHeadingElement>(null);
  const [summary, setSummary] = useState<DashboardSummary>();
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [backup, setBackup] = useState<BackupStatus>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [parked, archived, due, projects, groups, backups] = await Promise.all([
        getParkedLinks(), getArchivedLinks(), getDueReminderLinks(), getProjects(), getParkedSessionGroups(),
        // Backup status is extra context: if it can not be read, the rest of the page still works.
        getAutoBackups().catch(() => undefined),
      ]);
      if (!parked.success) throw new Error(parked.error.message);
      if (!archived.success) throw new Error(archived.error.message);
      if (!due.success) throw new Error(due.error.message);
      if (!projects.success) throw new Error(projects.error.message);
      setSummary(summarizeDashboard({ parked: parked.links, archived: archived.links, due: due.links, projects: projects.projects }));
      setSessions(groups.success ? recentSessions(groups.groups, projects.projects) : []);
      setBackup(backups?.success ? {
        enabled: backups.enabled,
        lastAt: backups.backups.map(entry => entry.createdAt).sort().at(-1),
        ...(backups.problem ? { problem: backups.problem } : {}),
      } : undefined);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LinkShelf could not load your overview.');
    }
  }, []);

  useEffect(() => {
    void load();
    // This page stays open in a tab, so catch up when it is shown again.
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  return <div>
    <SectionHeader headingRef={heading} title="Home" description="Where your saved links stand. Everything stays on this device." />
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!summary && !error && <SkeletonCards count={2} />}
    {summary && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon="check" label="To review" value={summary.toReview} href="#review"
          detail={summary.oldestWaitingSince ? `Oldest has waited ${describeWaiting(summary.oldestWaitingSince, new Date())}` : 'Nothing is waiting'} />
        <Tile icon="today" label="Reminders due" value={summary.dueReminders}
          detail={summary.dueReminders ? 'Open Today in the sidebar to act on them' : 'Nothing is due right now'} />
        <Tile icon="archive" label="Archived" value={summary.archived} href="#archive"
          detail={summary.archived ? 'Kept for later, out of the way' : 'Nothing archived yet'} />
      </div>
      <section aria-labelledby="home-projects" className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h3 id="home-projects" className="font-semibold text-slate-900">Waiting by project</h3>
        {summary.projects.length
          ? <ul className="mt-2 divide-y divide-slate-100">
            {summary.projects.map(({ project, count }) => <li key={project.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Icon name="folder" className="size-4 shrink-0 text-slate-500" /><span className="truncate">{project.name}</span></span>
              <span className="shrink-0 text-slate-600">{plural(count, 'link', 'links')}</span>
            </li>)}
          </ul>
          : <div className="mt-3"><EmptyState title="All caught up">Park some tabs from the sidebar and they will show up here.</EmptyState></div>}
        {summary.toReview > 0 && <a href="#review" className={buttonClass('primary', 'mt-3')}>Start reviewing</a>}
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <section aria-labelledby="home-recent" className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 id="home-recent" className="font-semibold text-slate-900">Recently parked</h3>
          {sessions.length
            ? <ul className="mt-2 divide-y divide-slate-100">
              {sessions.map(session => <li key={session.id} className="py-2 text-sm">
                <span className="block truncate font-medium">{session.firstTitle}{session.linkCount > 1 ? ` + ${session.linkCount - 1} more` : ''}</span>
                <span className="block text-xs text-slate-600">{session.projectName} · {plural(session.linkCount, 'link', 'links')} · {describeAgo(session.createdAt, new Date())}</span>
              </li>)}
            </ul>
            : <p className="mt-2 text-sm text-slate-600">Nothing parked yet.</p>}
        </section>
        {backup && <section aria-labelledby="home-backups" className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 id="home-backups" className="font-semibold text-slate-900">Backups</h3>
          <p className="mt-2 text-sm text-slate-700">{backupLine(backup)}</p>
          {backup.problem && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{backup.problem === 'space' ? 'The last automatic backup did not fit in the space Chrome allows.' : 'The last automatic backup could not be made.'}</p>}
          <a href="#settings" className={buttonClass('secondary', 'mt-3')}>{backup.enabled ? 'Backup settings' : 'Turn on automatic backups'}</a>
        </section>}
      </div>
    </>}
  </div>;
}

function backupLine(backup: BackupStatus) {
  if (!backup.enabled) return 'Automatic backups are off. Turn them on so a mistake never costs you your library.';
  return backup.lastAt ? `Last automatic backup: ${describeAgo(backup.lastAt, new Date())}.` : 'Automatic backups are on, but none has been made yet.';
}
