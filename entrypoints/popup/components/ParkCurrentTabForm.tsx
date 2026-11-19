import { OperationWarnings } from '@/entrypoints/sidepanel/components/ui/OperationWarnings';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Select } from '@/entrypoints/sidepanel/components/ui/Select';
import {
  localReminderToUtc,
  toLocalDateTimeInputValue,
} from '@/domain/reminders';
import type { Project } from '@/domain/schemas';
import { getParkDuplicates, getSettings, parkCurrentTab } from '@/messaging/contracts';

type ParkStatus = 'idle' | 'parking' | 'success' | 'partial' | 'error';

export function ParkCurrentTabForm({ tabId }: { tabId: number }) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');
  const [status, setStatus] = useState<ParkStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'park'>('skip');
  const pending = useRef(false);
  const outcome = useRef<HTMLParagraphElement>(null);
  const project = projects.find(item => item.id === projectId);
  const saved = status === 'success' || status === 'partial';

  useLayoutEffect(() => { if (saved) outcome.current?.focus(); }, [saved]);

  useEffect(() => {
    let current = true;
    void getSettings()
      .then((response) => {
        if (!current) return;
        if (!response.success) throw new Error(response.error.message);
        const defaultProject =
          response.projects.find((project) => project.id === response.settings.defaultProjectId) ??
          response.projects.find((project) => project.isInbox) ??
          response.projects[0];
        if (!defaultProject) {
          setProjectError('LinkShelf could not find a project for this tab.');
          return;
        }
        setProjects(response.projects);
        setProjectId(defaultProject.id);
      })
      .catch((error) => {
        if (current) setProjectError(error instanceof Error ? error.message : 'LinkShelf could not load projects.');
      })
      .finally(() => { if (current) setIsLoadingProjects(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    void getParkDuplicates([tabId]).then((response) => {
      if (current && response.success) setIsDuplicate(response.duplicateTabIds.includes(tabId));
    }).catch(() => undefined); // The check is advisory; parking still keeps the tab.
    return () => { current = false; };
  }, [tabId]);

  async function handlePark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || pending.current || saved) return;

    setWarnings([]);
    let reminderAt: string | undefined;
    try {
      reminderAt = localReminderToUtc(reminderLocal);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Choose a valid reminder.');
      return;
    }

    pending.current = true;
    setStatus('parking');
    setMessage(null);
    try {
      const response = await parkCurrentTab(tabId, {
        projectId,
        note: note.trim() || undefined,
        reminderAt,
        duplicates: isDuplicate ? duplicateMode : 'park',
      });
      const skipping = isDuplicate && duplicateMode === 'skip';
      setWarnings(response.warnings ?? []);
      if (!response.success) {
        setStatus(response.saved ? 'partial' : 'error');
        if (!response.saved) setMessage(response.error.message);
        else {
          const closure = response.error.code === 'TAB_CHANGED'
            ? 'The tab changed and LinkShelf left it open.'
            : 'Chrome couldn’t confirm the tab closed. Check your open tabs.';
          setMessage(`${skipping ? 'Already saved' : `Saved to ${project.name}`}. ${closure}`);
        }
        return;
      }
      setStatus('success');
      setMessage(response.skippedDuplicate ? 'Already saved, so nothing new was added. Closed the tab.' : `Saved to ${project.name} and closed the tab.`);
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'LinkShelf could not reach its background worker.',
      );
    } finally { pending.current = false; }
  }

  const minimumReminder = toLocalDateTimeInputValue(
    new Date(Date.now() + 60_000),
  );

  return (
    <form onSubmit={handlePark}>
      {!saved && <fieldset className="min-w-0" disabled={status === 'parking'}>
        <label className="text-sm font-semibold text-slate-700" htmlFor="project">Save to</label>
        <Select id="project" className="mt-1 w-full" title={project?.name} value={projectId} disabled={isLoadingProjects || !project} onChange={(event) => setProjectId(event.target.value)}>
          {!project && <option value="">{isLoadingProjects ? 'Loading projects…' : 'No project available'}</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </Select>
        {projectError && <p className="mt-1.5 text-sm text-red-700" role="alert">{projectError}</p>}

        {isDuplicate && <fieldset className="mt-2 min-w-0 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
          <legend className="px-1 text-sm font-semibold text-amber-950">This page is already saved</legend>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="duplicate-mode" className="mt-1 accent-blue-700" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} /><span>Don’t save it again, but close the tab</span></label>
          <label className="mt-1 flex items-start gap-2 text-sm"><input type="radio" name="duplicate-mode" className="mt-1 accent-blue-700" checked={duplicateMode === 'park'} onChange={() => setDuplicateMode('park')} /><span>Save it again</span></label>
        </fieldset>}

        <details className="mt-1">
          <summary className="min-h-10 content-center rounded text-sm font-medium text-blue-700">
            Add note or reminder
            {note.trim() || reminderLocal ? <span className="ms-1 text-xs text-slate-600">· {note.trim() && reminderLocal ? 'Both added' : note.trim() ? 'Note added' : 'Reminder set'}</span> : null}
          </summary>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <label className="block text-sm font-medium" htmlFor="note">Note</label>
            <textarea id="note" rows={2} className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-2.5 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} />
            <label className="mt-2 block text-sm font-medium" htmlFor="reminder">Reminder</label>
            <input id="reminder" type="datetime-local" className="mt-1 min-w-0 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" min={minimumReminder} value={reminderLocal} onChange={(event) => setReminderLocal(event.target.value)} />
            <p className="mt-1 text-xs text-slate-600">Uses your local time.</p>
          </div>
        </details>

        <button type="submit" className="mt-2 min-h-11 w-full rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50" disabled={!project || isLoadingProjects || Boolean(projectError) || status === 'parking'}>
          {status === 'parking' ? 'Parking tab…' : isDuplicate && duplicateMode === 'skip' ? 'Close tab' : 'Park and close'}
        </button>
      </fieldset>}
      {message && <p ref={outcome} tabIndex={saved ? -1 : undefined} className={`mt-2 rounded-lg p-2.5 text-sm wrap-anywhere ${status === 'error' ? 'bg-red-50 text-red-800' : status === 'partial' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
      <OperationWarnings warnings={warnings} />
    </form>
  );
}
