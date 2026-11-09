import { useEffect, useRef, useState } from 'react';
import { localReminderToUtc, toLocalDateTimeInputValue } from '@/domain/reminders';
import type { Project } from '@/domain/schemas';
import { getCurrentWindowTabs, getSettings, parkSelectedTabs, type WindowTabCandidate } from '@/messaging/contracts';
import { updateUiState } from '../ui-state';

export function ParkTabsSection({ onViewSaved }: { onViewSaved(projectId: string): void }) {
  const [step, setStep] = useState<'choose' | 'confirm' | 'saved'>('choose');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tabs, setTabs] = useState<WindowTabCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [projectId, setProjectId] = useState('');
  const [note, setNote] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isParking, setIsParking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const eligibleTabs = tabs.filter((tab) => tab.status === 'eligible');
  const skippedTabs = tabs.filter((tab) => tab.status !== 'eligible');
  const selectedProject = projects.find((project) => project.id === projectId);
  const allSelected = eligibleTabs.length > 0 && selectedIds.length === eligibleTabs.length;

  async function loadTabs() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await getCurrentWindowTabs();
      if (!response.success) throw new Error(response.error.message);
      setTabs(response.tabs);
      setSelectedIds((current) => current.filter((id) => response.tabs.some((tab) => tab.id === id && tab.status === 'eligible')));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not read this window. Try refreshing the tab list.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTabs();
    void getSettings().then((response) => {
      if (!response.success) throw new Error(response.error.message);
      setProjects(response.projects);
      setProjectId(response.settings.defaultProjectId);
    }).catch((error) => setFormError(error instanceof Error ? error.message : 'Could not load projects. Reopen Park tabs to try again.'));
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
    headingRef.current?.focus();
  }, [step]);

  function toggleTab(tabId: number) {
    setSelectedIds((current) => current.includes(tabId) ? current.filter((id) => id !== tabId) : [...current, tabId]);
  }

  async function confirmParking() {
    if (!selectedProject || !selectedIds.length || isParking) return;
    setFormError(null);
    let reminderAt: string | undefined;
    try {
      reminderAt = localReminderToUtc(reminderLocal);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Choose a future reminder time.');
      return;
    }
    setIsParking(true);
    try {
      const response = await parkSelectedTabs(selectedIds, { projectId, note: note.trim() || undefined, reminderAt });
      if (!response.success) throw new Error(response.error.message);
      const savedCount = response.linkIds.length;
      const failedCount = response.failedToCloseTabIds.length;
      setResultMessage(failedCount === 0
        ? `Saved and closed ${savedCount} tab${savedCount === 1 ? '' : 's'} in ${selectedProject.name}.`
        : `Saved all ${savedCount} tabs in ${selectedProject.name}. ${failedCount} could not be closed and remain open.`);
      setStep('saved');
      // A navigation preference failure must not turn a successful save into an error.
      void updateUiState({ selectedProjectId: projectId, expandedSessionIds: [response.sessionId] }).catch(() => undefined);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the tabs. Try again.');
    } finally {
      setIsParking(false);
    }
  }

  function parkMore() {
    setSelectedIds([]);
    setNote('');
    setReminderLocal('');
    setFormError(null);
    setStep('choose');
    void loadTabs();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-xs font-semibold text-blue-700">{step === 'saved' ? 'Saved to your shelf' : `Step ${step === 'choose' ? '1' : '2'} of 2`}</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-lg font-bold focus:outline-none">
          {step === 'choose' ? 'Choose tabs to save' : step === 'confirm' ? 'Save and close' : 'Your tabs are saved'}
        </h2>
        {step === 'choose' && <>
          <p className="mt-1 text-sm text-slate-600">Parking saves your links and closes the tabs. Find and reopen them in Saved whenever you need them.</p>
          <div className="my-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">Current window</span>
            <div className="flex gap-2">
              <button type="button" className="min-h-9 px-2 text-sm font-semibold text-blue-700 disabled:opacity-50" disabled={isLoading} onClick={() => void loadTabs()}>Refresh</button>
              <button type="button" className="min-h-9 px-2 text-sm font-semibold text-blue-700 disabled:opacity-50" disabled={isLoading || !eligibleTabs.length} onClick={() => setSelectedIds(allSelected ? [] : eligibleTabs.map((tab) => tab.id))}>{allSelected ? 'Clear selection' : 'Select all'}</button>
            </div>
          </div>
          {isLoading && <p role="status" className="py-3 text-sm text-slate-500">Reading tabs…</p>}
          {loadError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
          {!isLoading && !loadError && <>
            {!eligibleTabs.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-600">Open a webpage you want to save, then refresh this list.</p>}
            {eligibleTabs.length > 0 && <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {eligibleTabs.map((tab) => <label key={tab.id} className={`flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 ${selectedIds.includes(tab.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" className="size-4 shrink-0 accent-blue-700" checked={selectedIds.includes(tab.id)} onChange={() => toggleTab(tab.id)} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold" title={tab.title}>{tab.title}</span><span className="block truncate text-xs text-slate-500">{tab.domain}{tab.active ? ' · Current tab' : ''}</span></span>
              </label>)}
            </div>}
            {skippedTabs.length > 0 && <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer py-2">{skippedTabs.length} pinned or browser tab{skippedTabs.length === 1 ? '' : 's'} will stay open</summary><ul className="mt-1 space-y-2">{skippedTabs.map((tab) => <li key={tab.id}><span className="font-medium">{tab.title}</span> — {tab.reason}</li>)}</ul></details>}
          </>}
        </>}
        {step === 'confirm' && <>
          <p className="mt-1 text-sm text-slate-600">{selectedIds.length} selected tab{selectedIds.length === 1 ? '' : 's'} will be saved together as a session.</p>
          <label className="mt-5 block text-sm font-semibold" htmlFor="bulk-project">Save to project</label>
          <select id="bulk-project" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={projectId} disabled={isParking} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-blue-700">Add note or reminder</summary>
            <label className="mt-3 block text-sm font-medium" htmlFor="bulk-note">Note for these tabs</label>
            <textarea id="bulk-note" rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={note} disabled={isParking} onChange={(event) => setNote(event.target.value)} />
            <label className="mt-3 block text-sm font-medium" htmlFor="bulk-reminder">Remind me</label>
            <input id="bulk-reminder" type="datetime-local" className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm" min={toLocalDateTimeInputValue(new Date(Date.now() + 60_000))} value={reminderLocal} disabled={isParking} onChange={(event) => setReminderLocal(event.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Uses your local timezone. Due reminders appear in Saved.</p>
          </details>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Links are saved before tabs close. Save any unfinished work on those pages first. Page forms and unsaved edits cannot be restored.</p>
        </>}
        {step === 'saved' && <p className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{resultMessage}</p>}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-3">
        {formError && <p className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {step === 'choose' && <><span className="text-sm font-medium text-slate-600" role="status">{selectedIds.length} selected</span><button type="button" className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={isLoading || Boolean(loadError) || !selectedIds.length || !selectedProject} onClick={() => setStep('confirm')}>Continue</button></>}
          {step === 'confirm' && <><button type="button" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50" disabled={isParking} onClick={() => { setFormError(null); setStep('choose'); }}>Back</button><button type="button" className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={isParking || !selectedProject} onClick={() => void confirmParking()}>{isParking ? 'Saving before closing…' : `Save & close ${selectedIds.length} tab${selectedIds.length === 1 ? '' : 's'}`}</button></>}
          {step === 'saved' && <><button type="button" className="rounded-lg px-2 py-2.5 text-sm font-semibold text-slate-600" onClick={parkMore}>Park more tabs</button><button type="button" className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => onViewSaved(projectId)}>View saved tabs</button></>}
        </div>
      </footer>
    </div>
  );
}
