import { OperationWarnings } from '@/entrypoints/sidepanel/components/ui/OperationWarnings';
import { useEffect, useState } from 'react';
import { INBOX_PROJECT_ID } from '@/domain/constants';
import {
  localReminderToUtc,
  toLocalDateTimeInputValue,
} from '@/domain/reminders';
import type { Project } from '@/domain/schemas';
import { getProjects, parkCurrentTab } from '@/messaging/contracts';

type ParkStatus = 'idle' | 'parking' | 'success' | 'error';

interface ParkCurrentTabFormProps {
  tabId: number;
  isEligible: boolean;
}

export function ParkCurrentTabForm({
  tabId,
  isEligible,
}: ParkCurrentTabFormProps) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(INBOX_PROJECT_ID);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');
  const [status, setStatus] = useState<ParkStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    void getProjects()
      .then((response) => {
        if (!response.success) {
          setProjectError(response.error.message);
          return;
        }
        const defaultProject =
          response.projects.find((project) => project.isInbox) ??
          response.projects[0];
        if (!defaultProject) {
          setProjectError('LinkShelf could not find a project for this tab.');
          return;
        }
        setProjects(response.projects);
        setProjectId(defaultProject.id);
      })
      .catch((error) =>
        setProjectError(
          error instanceof Error
            ? error.message
            : 'LinkShelf could not load projects.',
        ),
      )
      .finally(() => setIsLoadingProjects(false));
  }, []);

  async function handlePark() {
    if (!isEligible || !projectId || (status === 'parking' || status === 'success')) return;

    let reminderAt: string | undefined;
    try {
      reminderAt = localReminderToUtc(reminderLocal);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Choose a valid reminder.');
      return;
    }

    setStatus('parking');
    setMessage(null);
    try {
      const response = await parkCurrentTab(tabId, {
        projectId,
        note: note.trim() || undefined,
        reminderAt,
      });
      setWarnings(response.warnings ?? []);
      if (!response.success) {
        setStatus(response.saved ? 'success' : 'error');
        setMessage(response.error.message);
        return;
      }
      setStatus('success');
      setMessage('The tab was parked and closed.');
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'LinkShelf could not reach its background worker.',
      );
    }
  }

  const disabled =
    !isEligible ||
    projects.length === 0 ||
    isLoadingProjects ||
    Boolean(projectError) ||
    (status === 'parking' || status === 'success');
  const minimumReminder = toLocalDateTimeInputValue(
    new Date(Date.now() + 60_000),
  );

  return (
    <>
      <OperationWarnings warnings={warnings} />
      <label className="text-sm font-semibold text-slate-700" htmlFor="project">Project</label>
      <select id="project" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100" value={projectId} disabled={isLoadingProjects || status === 'parking'} onChange={(event) => setProjectId(event.target.value)}>
        {isLoadingProjects && <option value={INBOX_PROJECT_ID}>Loading projects...</option>}
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      {projectError && <p className="mt-1.5 text-sm text-red-700" role="alert">{projectError}</p>}

      <button type="button" className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-blue-700 hover:text-blue-900" aria-expanded={showDetails} onClick={() => setShowDetails((shown) => !shown)}>{showDetails ? '− Hide details' : '+ Add note or reminder'}</button>
      {showDetails && <div className="rounded-xl bg-slate-50 p-3">
        <label className="block text-sm font-semibold text-slate-700" htmlFor="note">Note <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea id="note" rows={2} className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={note} disabled={status === 'parking'} onChange={(event) => setNote(event.target.value)} />
        <label className="mt-3 block text-sm font-semibold text-slate-700" htmlFor="reminder">Reminder <span className="font-normal text-slate-400">(optional)</span></label>
        <input id="reminder" type="datetime-local" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" min={minimumReminder} value={reminderLocal} disabled={status === 'parking'} onChange={(event) => setReminderLocal(event.target.value)} />
        <p className="mt-1 text-xs text-slate-400">Uses your local timezone.</p>
      </div>}

      <button type="button" className="mt-4 w-full rounded-xl bg-blue-700 px-3.5 py-3 font-bold text-white shadow-sm shadow-blue-900/10 hover:bg-blue-800 disabled:opacity-50" disabled={disabled} onClick={() => void handlePark()}>
        {status === 'parking' ? 'Parking tab...' : status === 'success' ? 'Tab saved' : 'Park and close'}
      </button>
      {message && <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-700' : 'text-emerald-700'}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
    </>
  );
}
