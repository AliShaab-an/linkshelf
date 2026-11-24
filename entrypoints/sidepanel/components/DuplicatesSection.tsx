import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extraCopies, findDuplicates, type DuplicateGroup } from '@/domain/duplicates';
import type { Project } from '@/domain/schemas';
import { getArchivedLinks, getParkedLinks, getProjects, removeLink } from '@/messaging/contracts';
import { formatLinkDate, LinkFavicon } from './SavedLinkCard';
import { EmptyState, SkeletonCards } from './ui/Feedback';
import { SectionHeader } from './ui/SectionHeader';
import { buttonClass } from './ui/styles';

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Addresses saved more than once, with a quick way to keep one copy and send the rest to the Bin. */
export function DuplicatesSection() {
  const heading = useRef<HTMLHeadingElement>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const names = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects]);

  const load = useCallback(async () => {
    try {
      const [parked, archived, projectList] = await Promise.all([getParkedLinks(), getArchivedLinks(), getProjects()]);
      if (!parked.success) throw new Error(parked.error.message);
      if (!archived.success) throw new Error(archived.error.message);
      if (!projectList.success) throw new Error(projectList.error.message);
      setProjects(projectList.projects);
      setGroups(findDuplicates([...parked.links, ...archived.links]));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LinkShelf could not look for duplicates.');
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  /** Sends each extra copy to the Bin in turn, then reports how many went. */
  async function removeCopies(ids: string[]) {
    if (busy || ids.length === 0) return;
    setBusy(true); setError(''); setMessage(''); setConfirmingAll(false);
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-duplicate-group]')) heading.current?.focus();
    let removed = 0;
    let failure: string | undefined;
    for (const id of ids) {
      try {
        const response = await removeLink(id);
        if (response.success) removed++;
        else failure ??= response.error.message;
      } catch (caught) {
        failure ??= caught instanceof Error ? caught.message : 'LinkShelf could not remove a copy.';
      }
    }
    if (removed === ids.length) setMessage(`Moved ${plural(removed, 'extra copy', 'extra copies')} to the Bin.`);
    else setError(`Moved ${removed} of ${plural(ids.length, 'copy', 'copies')} to the Bin. ${failure ?? ''}`.trim());
    await load();
    setBusy(false);
  }

  const extras = groups?.reduce((sum, group) => sum + group.links.length - 1, 0) ?? 0;

  return <div>
    <SectionHeader headingRef={heading} title="Duplicates"
      description="Links you saved more than once, matched by address. Keep one copy and the others go to the Bin, where you can recover them for 30 days."
      action={groups && groups.length > 0 && !confirmingAll
        ? <button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => setConfirmingAll(true)}>Keep the newest of each</button>
        : undefined} />
    {confirmingAll && groups && <div role="group" aria-label="Keep the newest of each" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <span className="text-amber-950">Keep the newest copy of {plural(groups.length, 'address', 'addresses')} and move {plural(extras, 'extra copy', 'extra copies')} to the Bin?</span>
      <button type="button" className={buttonClass('primary')} disabled={busy}
        onClick={() => void removeCopies(groups.flatMap(group => extraCopies(group, group.links[0].id).map(link => link.id)))}>Keep newest</button>
      <button type="button" className={buttonClass('ghost')} disabled={busy} onClick={() => setConfirmingAll(false)}>Cancel</button>
    </div>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <p role="status" className="mb-3 min-h-5 text-sm text-slate-700">{busy ? 'Moving copies to the Bin…' : message}</p>
    {!groups && !error && <SkeletonCards count={2} />}
    {groups && groups.length === 0 && <EmptyState title="No duplicates">Every parked and archived link has its own address.</EmptyState>}
    {groups && groups.length > 0 && <>
      <p className="mb-3 text-sm text-slate-700">{plural(groups.length, 'address', 'addresses')} saved more than once · {plural(extras, 'extra copy', 'extra copies')}</p>
      <div className="space-y-3">
        {groups.map(group => <section key={group.normalizedUrl} data-duplicate-group aria-label={`${group.links[0].title}, ${plural(group.links.length, 'copy', 'copies')}`}
          className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <LinkFavicon link={group.links[0]} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-slate-900" dir="auto">{group.links[0].title}</h3>
              <p className="truncate text-xs text-slate-600" title={group.normalizedUrl}>{group.normalizedUrl}</p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{plural(group.links.length, 'copy', 'copies')}</span>
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {group.links.map(link => <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-slate-900" dir="auto">{link.title}</p>
                <p className="truncate text-xs text-slate-600">
                  {names.get(link.projectId) ?? 'Unknown project'} · {link.status === 'archived' ? 'Archived' : 'Parked'} · Saved {formatLinkDate(link.createdAt)}
                </p>
              </div>
              <button type="button" className={buttonClass('quiet')} disabled={busy} aria-label={`Keep this copy of ${link.title} in ${names.get(link.projectId) ?? 'its project'}`}
                onClick={() => void removeCopies(extraCopies(group, link.id).map(copy => copy.id))}>Keep this one</button>
            </li>)}
          </ul>
        </section>)}
      </div>
    </>}
  </div>;
}
