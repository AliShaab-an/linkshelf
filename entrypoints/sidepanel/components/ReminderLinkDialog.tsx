import { useId, useState } from 'react';
import type { SavedLink } from '@/domain/schemas';
import { InvalidReminderError, localReminderToUtc, toLocalDateTimeInputValue } from '@/domain/reminders';
import { snoozePresets } from '@/domain/snooze';
import { setLinkReminder } from '@/messaging/contracts';
import { Button } from './ui/Button';
import { Modal, type ReturnFocus } from './ui/Modal';

interface ReminderLinkDialogProps {
  link: SavedLink;
  /** A due link is being snoozed rather than given a first reminder. */
  snooze: boolean;
  returnFocus: ReturnFocus;
  /** Called with the saved link and any warnings once the worker confirms the change. */
  onSaved(link: SavedLink, change: 'set' | 'cleared', warnings: string[]): void;
  onCancel(): void;
}

const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ReminderLinkDialog({ link, snooze, returnFocus, onSaved, onCancel }: ReminderLinkDialogProps) {
  const [custom, setCustom] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const inputId = useId();
  const errorId = useId();
  const presets = snoozePresets();
  const minimum = toLocalDateTimeInputValue(new Date());

  async function save(reminderAt: string | null) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await setLinkReminder(link.id, reminderAt);
      if (!response.success) throw new Error(response.error.message);
      onSaved(response.link, reminderAt === null ? 'cleared' : 'set', response.warnings ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LinkShelf could not save this reminder.');
      setPending(false);
    }
  }

  function saveCustom() {
    try {
      const reminderAt = localReminderToUtc(custom);
      if (!reminderAt) { setError('Choose a date and time.'); return; }
      void save(reminderAt);
    } catch (cause) {
      setError(cause instanceof InvalidReminderError ? cause.message : 'Choose a valid reminder date and time.');
    }
  }

  return <Modal titleId="reminder-link-title" pending={pending} returnFocus={returnFocus} onClose={onCancel}>
    <h3 id="reminder-link-title" tabIndex={-1} className="text-lg font-bold wrap-anywhere">{snooze ? 'Snooze' : 'Remind me about'} “{link.title}”</h3>
    {link.reminderAt && !snooze && <p className="mt-1 text-sm text-slate-600">Current reminder: {formatter.format(new Date(link.reminderAt))}</p>}
    <div role="group" aria-label="Quick choices" className="mt-3 grid gap-2">
      {presets.map((preset) => <button key={preset.id} type="button" disabled={pending} data-modal-initial={preset.id === 'hour' || undefined}
        className="flex min-h-11 items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
        onClick={() => void save(preset.at.toISOString())}>
        <span>{preset.label}</span><span className="text-xs font-normal text-slate-600">{formatter.format(preset.at)}</span>
      </button>)}
    </div>
    <form noValidate className="mt-4" onSubmit={(event) => { event.preventDefault(); saveCustom(); }}>
      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor={inputId}>Pick a date and time</label>
      <input id={inputId} type="datetime-local" min={minimum} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={custom} disabled={pending}
        aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}
        onChange={(event) => { setCustom(event.target.value); setError(undefined); }} />
      {error && <p id={errorId} role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {pending && <p role="status" className="mt-2 text-sm text-slate-700">Saving reminder…</p>}
      <Button type="submit" variant="primary" className="mt-4 w-full" disabled={pending || !custom}>Set reminder</Button>
      <div className="mt-2 flex gap-2">
        {link.reminderAt && <Button type="button" className="flex-1" disabled={pending} onClick={() => void save(null)}>{snooze ? 'Dismiss reminder' : 'Clear reminder'}</Button>}
        <Button type="button" className={link.reminderAt ? '' : 'flex-1'} disabled={pending} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  </Modal>;
}
