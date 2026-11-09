import { OperationWarnings } from '@/entrypoints/sidepanel/components/ui/OperationWarnings';
import { useEffect, useState, type FormEvent } from 'react';
import {
  localReminderToUtc,
  toLocalDateTimeInputValue,
} from '@/domain/reminders';
import type { Project } from '@/domain/schemas';
import {
  getCurrentWindowTabs,
  getProjects,
  parkSelectedTabs,
  type WindowTabCandidate,
} from '@/messaging/contracts';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ParkTabsSection() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tabs, setTabs] = useState<WindowTabCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [note, setNote] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewReminderAt, setReviewReminderAt] = useState<string>();
  const [isReviewing, setIsReviewing] = useState(false);
  const [isParking, setIsParking] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const eligibleTabs = tabs.filter((tab) => tab.status === 'eligible');
  const allEligibleSelected =
    eligibleTabs.length > 0 &&
    eligibleTabs.every((tab) => selectedIds.includes(tab.id));
  const selectedProject = projects.find((project) => project.id === projectId);
  const minimumReminder = toLocalDateTimeInputValue(
    new Date(Date.now() + 60_000),
  );

  async function loadTabs() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await getCurrentWindowTabs();

      if (!response.success) {
        setLoadError(response.error.message);
        return;
      }

      setTabs(response.tabs);
      setSelectedIds((currentIds) =>
        currentIds.filter((tabId) =>
          response.tabs.some(
            (tab) => tab.id === tabId && tab.status === 'eligible',
          ),
        ),
      );
      setIsReviewing(false);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'LinkShelf could not read this window\'s tabs.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTabs();
    void getProjects().then((response) => {
      if (response.success) {
        setProjects(response.projects);
        setProjectId(
          response.projects.find((project) => project.isInbox)?.id ??
            response.projects[0]?.id ??
            '',
        );
      } else {
        setFormError(response.error.message);
      }
    });
  }, []);

  function resetReview() {
    setIsReviewing(false);
    setFormError(null);
    setResultMessage(null);
  }

  function toggleTab(tabId: number) {
    const tab = tabs.find((candidate) => candidate.id === tabId);

    if (!tab || tab.status !== 'eligible') {
      return;
    }

    setSelectedIds((currentIds) =>
      currentIds.includes(tabId)
        ? currentIds.filter((id) => id !== tabId)
        : [...currentIds, tabId],
    );
    resetReview();
  }

  function toggleAll() {
    setSelectedIds(
      allEligibleSelected ? [] : eligibleTabs.map((tab) => tab.id),
    );
    resetReview();
  }

  function reviewPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (selectedIds.length === 0) {
      setFormError('Select at least one eligible tab.');
      return;
    }

    if (!selectedProject) {
      setFormError('Select an existing project.');
      return;
    }

    try {
      setReviewReminderAt(localReminderToUtc(reminderLocal));
      setIsReviewing(true);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Choose a valid future reminder.',
      );
    }
  }

  async function confirmParking() {
    if (!isReviewing || !selectedProject || isParking) {
      return;
    }

    setIsParking(true);
    setFormError(null);

    try {
      const response = await parkSelectedTabs(selectedIds, {
        projectId: selectedProject.id,
        note: note.trim() || undefined,
        reminderAt: reviewReminderAt,
      });
      setWarnings(response.warnings ?? []);

      if (!response.success) {
        setFormError(response.error.message);
        setIsReviewing(false);
        return;
      }

      const savedCount = response.linkIds.length;
      const failedCount = response.failedToCloseTabIds.length;
      setResultMessage(
        failedCount === 0
          ? `Saved and closed ${savedCount} tab${savedCount === 1 ? '' : 's'} in one parking session.`
          : `Saved all ${savedCount} tabs; ${failedCount} closures were not confirmed. Changed or unreadable tabs were left untouched.`,
      );
      setSelectedIds([]);
      setNote('');
      setReminderLocal('');
      setReviewReminderAt(undefined);
      setIsReviewing(false);
      await loadTabs();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'LinkShelf could not park the selected tabs.',
      );
    } finally {
      setIsParking(false);
    }
  }

  return (
    <>
      <OperationWarnings warnings={warnings} />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Current window
          </p>
          <h2 className="mt-1 text-lg font-bold">Park tabs</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select eligible tabs, then save them as one parking session.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
          disabled={isLoading || isParking}
          onClick={() => void loadTabs()}
        >
          Refresh
        </button>
      </div>

      {resultMessage && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">
          {resultMessage}
        </p>
      )}
      {isLoading && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">Reading tabs...</p>}
      {!isLoading && loadError && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{loadError}</p>
      )}

      {!isLoading && !loadError && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            {([
              ['Eligible', eligibleTabs.length, 'bg-emerald-50 text-emerald-800'],
              ['Pinned', tabs.filter((tab) => tab.status === 'pinned').length, 'bg-amber-50 text-amber-800'],
              ['Restricted', tabs.filter((tab) => tab.status === 'restricted').length, 'bg-slate-200 text-slate-700'],
            ] as const).map(([label, count, classes]) => (
              <div key={label} className={`rounded-lg p-2 ${classes}`}>
                <strong className="block text-base">{count}</strong>{label}
              </div>
            ))}
          </div>

          {eligibleTabs.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-semibold text-blue-900">
                {selectedIds.length} of {eligibleTabs.length} selected
              </p>
              <button type="button" className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-blue-800" onClick={toggleAll}>
                {allEligibleSelected ? 'Clear selection' : 'Select all eligible'}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {tabs.map((tab) => {
              const selected = selectedIds.includes(tab.id);
              return (
                <article key={tab.id} className={selected ? 'rounded-xl border border-blue-400 bg-blue-50/40 p-3.5 ring-1 ring-blue-200' : 'rounded-xl border border-slate-200 bg-white p-3.5'}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 size-4 accent-blue-700 disabled:opacity-40" aria-label={`Select ${tab.title}`} checked={selected} disabled={tab.status !== 'eligible'} onChange={() => toggleTab(tab.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{tab.title}</h3>
                          <p className="mt-1 truncate text-sm text-slate-500">{tab.domain}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold capitalize text-slate-700">{tab.status}</span>
                      </div>
                      {tab.active && <p className="mt-2 text-xs font-semibold text-blue-700">Active tab</p>}
                      {tab.reason && <p className="mt-2 text-xs text-slate-500">{tab.reason}</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {selectedIds.length > 0 && (
            <form className="mt-4 rounded-xl border border-slate-200 bg-white p-4" onSubmit={reviewPlan}>
              <h3 className="font-semibold">Parking details</h3>
              <p className="mt-1 text-sm text-slate-500">Shared by all selected tabs.</p>
              <label className="mt-4 block text-sm font-semibold" htmlFor="bulk-project">Project</label>
              <select id="bulk-project" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={projectId} onChange={(event) => { setProjectId(event.target.value); resetReview(); }}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <label className="mt-4 block text-sm font-semibold" htmlFor="bulk-note">Shared note <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id="bulk-note" className="mt-2 min-h-20 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm" value={note} onChange={(event) => { setNote(event.target.value); resetReview(); }} />
              <label className="mt-4 block text-sm font-semibold" htmlFor="bulk-reminder">Shared reminder <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="bulk-reminder" type="datetime-local" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" min={minimumReminder} value={reminderLocal} onChange={(event) => { setReminderLocal(event.target.value); resetReview(); }} />
              <p className="mt-1 text-xs text-slate-500">Entered locally and stored as UTC.</p>
              {formError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{formError}</p>}
              <button type="submit" className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white">Review {selectedIds.length} selected tab{selectedIds.length === 1 ? '' : 's'}</button>
            </form>
          )}

          {isReviewing && selectedProject && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Confirmation</p>
              <h3 className="mt-1 font-semibold">Park {selectedIds.length} tabs in {selectedProject.name}?</h3>
              <p className="mt-2 text-sm text-blue-950">Note: {note.trim() || 'None'}<br />Reminder: {reviewReminderAt ? formatDate(reviewReminderAt) : 'None'}</p>
              <p className="mt-3 border-t border-blue-200 pt-3 text-sm text-blue-950">LinkShelf saves everything first, then closes the tabs. Unsaved webpage form data cannot be restored.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="flex-1 rounded-lg border border-blue-300 bg-white px-3 py-2.5 text-sm font-semibold" disabled={isParking} onClick={() => setIsReviewing(false)}>Go back</button>
                <button type="button" className="flex-[2] rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={isParking} onClick={() => void confirmParking()}>{isParking ? 'Saving before closing...' : `Confirm and park ${selectedIds.length}`}</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
