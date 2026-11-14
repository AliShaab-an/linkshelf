import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { localReminderToUtc, toLocalDateTimeInputValue } from '@/domain/reminders';
import type { Project } from '@/domain/schemas';
import { getCurrentWindowTabs, getProjects, parkSelectedTabs, type WindowTabCandidate } from '@/messaging/contracts';
import { Modal } from './ui/Modal';
import { OperationWarnings } from './ui/OperationWarnings';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { parkingOutcome, type SavedSessionTarget } from '../parking-outcome';

export function ParkTabsSection({ onViewSession }: { onViewSession(target: SavedSessionTarget): void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tabs, setTabs] = useState<WindowTabCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [projectError, setProjectError] = useState<string>();
  const [projectId, setProjectId] = useState('');
  const [note, setNote] = useState('');
  const [reminderLocal, setReminderLocal] = useState('');
  const [extraDetails, setExtraDetails] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ReturnType<typeof parkingOutcome>>();
  const inFlight = useRef(false);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [selectedNotice, setSelectedNotice] = useState('');
  const selected = new Set(selectedIds);
  const eligibleTabs = tabs.filter(tab => tab.status === 'eligible');
  const selectedTabs = eligibleTabs.filter(tab => selected.has(tab.id));
  const project = projects.find(item => item.id === projectId);

  async function loadTabs(isCurrent = () => true) {
    setLoading(true);
    setLoadError(undefined);
    try {
      const response = await getCurrentWindowTabs();
      if (!isCurrent()) return;
      if (!response.success) throw new Error(response.error.message);
      const eligible = new Set(response.tabs.filter(tab => tab.status === 'eligible').map(tab => tab.id));
      setTabs(response.tabs);
      setSelectedIds(ids => ids.filter(id => eligible.has(id)));
      setNeedsRefresh(false);
    } catch (cause) {
      if (isCurrent()) setLoadError(cause instanceof Error ? cause.message : 'LinkShelf could not read this window’s tabs.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  useEffect(() => {
    let current = true;
    void loadTabs(() => current);
    void getProjects().then(response => {
      if (!current) return;
      if (!response.success) throw new Error(response.error.message);
      setProjects(response.projects);
      setProjectId(response.projects.find(item => item.isInbox)?.id ?? response.projects[0]?.id ?? '');
    }).catch(cause => {
      if (current) setProjectError(cause instanceof Error ? cause.message : 'LinkShelf could not read projects.');
    });
    return () => { current = false; };
  }, []);

  useLayoutEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  function choose(ids: number[]) {
    setSelectedIds(ids);
    setSelectedNotice('');
    setResult(undefined);
    setError(undefined);
    setWarnings([]);
  }

  function back() {
    setReviewing(false);
    if (needsRefresh) setSelectedNotice('Refresh tabs before reviewing the selection again.');
    setError(undefined);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !selectedIds.length || inFlight.current || needsRefresh) return;
    let reminderAt: string | undefined;
    try {
      reminderAt = localReminderToUtc(reminderLocal);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Choose a valid future reminder.');
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setWarnings([]);
    try {
      const response = await parkSelectedTabs(selectedIds, { projectId, note: note.trim() || undefined, reminderAt });
      setWarnings(response.warnings ?? []);
      if (!response.success) {
        setError(response.error.message);
        setNeedsRefresh(['TAB_NOT_FOUND', 'TAB_NOT_ELIGIBLE', 'TABS_MOVED', 'INVALID_SELECTION'].includes(response.error.code));
        return;
      }
      setSelectedIds([]);
      setNote('');
      setReminderLocal('');
      setExtraDetails(false);
      setReviewing(false);
      setResult(parkingOutcome(response, project.id));
      await loadTabs();
    } catch {
      setNeedsRefresh(true);
      setError('LinkShelf could not confirm the result. Check Saved and your open tabs before trying again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <>
    <div className="mb-4 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold">Park tabs</h2>
        <p className="mt-1 text-sm text-slate-600">Choose tabs in this window to save together.</p>
      </div>
      <Button ref={refreshButton} type="button" disabled={loading || pending} onClick={() => {
        setSelectedNotice('');
        void loadTabs();
      }}>Refresh</Button>
    </div>

    {result && <section aria-labelledby="parking-result-title" className={`mb-4 rounded-xl border p-4 ${result.unconfirmed ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <h3 ref={resultHeading} tabIndex={-1} id="parking-result-title" className="font-bold">Parking session saved</h3>
      <p className="mt-1 wrap-anywhere text-sm">Saved {result.saved} {result.saved === 1 ? 'tab' : 'tabs'}{project ? ` to ${project.name}` : ''}. {result.unconfirmed ? `Closed ${result.closed} of ${result.saved}.` : 'All saved tabs closed.'}</p>
      {result.unconfirmed > 0 && <p className="mt-2 text-sm">Chrome could not confirm closing {result.unconfirmed} {result.unconfirmed === 1 ? 'tab' : 'tabs'}. Check your open tabs before parking again.</p>}
      <Button type="button" variant="primary" className="mt-3" onClick={() => onViewSession(result.target)}>View saved session</Button>
    </section>}
    {!reviewing && <OperationWarnings warnings={warnings} />}
    {loading && <p role="status" className="mb-3 text-sm text-slate-600">Reading tabs…</p>}
    {loadError && <p role="alert" className="mb-3 text-sm text-red-700">{loadError}</p>}
    {projectError && <p role="alert" className="mb-3 text-sm text-red-700">{projectError}</p>}
    {selectedNotice && <p role="status" className="mb-3 text-sm text-amber-900">{selectedNotice}</p>}
    {!loading && !loadError && eligibleTabs.length === 0 && <p className="mb-3 text-sm text-slate-600">No eligible tabs in this window.</p>}
    {eligibleTabs.length > 0 && <Button type="button" className="mb-3" disabled={loading || !!loadError || pending}
      onClick={() => choose(selectedTabs.length === eligibleTabs.length ? [] : eligibleTabs.map(tab => tab.id))}>
      {selectedTabs.length === eligibleTabs.length ? 'Clear selection' : 'Select all eligible'}
    </Button>}
    <ul aria-label="Tabs in this window" className="space-y-2">
      {tabs.map(tab => <li key={tab.id}>
        <label className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 ${selected.has(tab.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-blue-700" aria-label={`Select ${tab.title}`}
            checked={selected.has(tab.id)} disabled={tab.status !== 'eligible' || loading || !!loadError || pending}
            onChange={() => choose(selected.has(tab.id) ? selectedIds.filter(id => id !== tab.id) : [...selectedIds, tab.id])} />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{tab.title}</span>
            <span className="block break-all text-xs text-slate-600">{tab.domain}</span>
            {tab.reason && <span className="mt-1 block text-xs text-slate-600">{tab.reason}</span>}
          </span>
          {tab.status !== 'eligible' && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize">{tab.status}</span>}
        </label>
      </li>)}
    </ul>
    <div className="parking-actions sticky bottom-0 z-30 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-slate-200 bg-white p-3 shadow-lg">
      <span role="status" className="text-sm font-semibold">{selectedTabs.length} selected</span>
      <Button type="button" variant="primary" disabled={!selectedTabs.length || !project || loading || !!loadError || pending || needsRefresh}
        onClick={() => { setResult(undefined); setError(undefined); setReviewing(true); }}>Review selection</Button>
    </div>

    {reviewing && <Modal titleId="parking-review-title" pending={pending} onClose={back}
      returnFocus={invoker => needsRefresh ? refreshButton.current : invoker}>
      <h3 id="parking-review-title" tabIndex={-1} className="text-lg font-bold">Review {selectedTabs.length} selected {selectedTabs.length === 1 ? 'tab' : 'tabs'}</h3>
      <form onSubmit={event => void confirm(event)} className="mt-3">
        <fieldset disabled={pending} className="min-w-0 space-y-3">
          <label className="block text-sm font-semibold" htmlFor="bulk-project">Save to project</label>
          <Select id="bulk-project" className="w-full" value={projectId} onChange={event => setProjectId(event.target.value)}>
            {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <details open={extraDetails} onToggle={event => setExtraDetails(event.currentTarget.open)}>
            <summary className="cursor-pointer rounded py-2 text-sm font-semibold text-blue-800">Add note or reminder</summary>
            <label className="mt-2 block text-sm font-semibold" htmlFor="bulk-note">Shared note (optional)</label>
            <textarea id="bulk-note" rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={note} onChange={event => setNote(event.target.value)} />
            <label className="mt-2 block text-sm font-semibold" htmlFor="bulk-reminder">Shared reminder (optional)</label>
            <input id="bulk-reminder" type="datetime-local" className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm"
              min={toLocalDateTimeInputValue(new Date(Date.now() + 60_000))} value={reminderLocal} onChange={event => setReminderLocal(event.target.value)} />
            <p className="mt-1 text-xs text-slate-600">Uses your local time.</p>
          </details>
          <details>
            <summary className="cursor-pointer rounded py-2 text-sm font-semibold text-blue-800">Selected tabs</summary>
            <ul className="list-disc space-y-1 pl-5 text-sm">{selectedTabs.map(tab => <li key={tab.id}>{tab.title}</li>)}</ul>
          </details>
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">LinkShelf saves these tabs before attempting to close them. Unsaved changes on webpages cannot be restored.</p>
        </fieldset>
        <div role="status" aria-atomic="true">{pending && <p className="mt-2 text-sm">Saving before closing…</p>}</div>
        <div role="alert">{error && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div>
        <OperationWarnings warnings={warnings} />
        <div className="sticky bottom-0 mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-2">
          <Button type="button" disabled={pending} onClick={back}>Back</Button>
          <Button type="submit" variant="primary" disabled={pending || needsRefresh || !project}>Save &amp; close {selectedTabs.length}</Button>
        </div>
      </form>
    </Modal>}
  </>;
}
