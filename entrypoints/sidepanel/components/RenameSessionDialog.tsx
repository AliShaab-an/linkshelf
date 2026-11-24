import { useId, useState, type FormEvent } from 'react';
import { SESSION_NAME_MAX_LENGTH, type ParkingSession } from '@/domain/schemas';
import { renameSession } from '@/messaging/contracts';
import { Button } from './ui/Button';
import { Modal, type ReturnFocus } from './ui/Modal';

/** Names a parking session, or clears its name. */
export function RenameSessionDialog({ session, returnFocus, onSaved, onCancel }: {
  session: ParkingSession;
  returnFocus: ReturnFocus;
  onSaved(session: ParkingSession): void;
  onCancel(): void;
}) {
  const [name, setName] = useState(session.name ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const inputId = useId();
  const errorId = useId();

  async function save(next: string | null) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await renameSession(session.id, next);
      if (!response.success) throw new Error(response.error.message);
      onSaved(response.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LinkShelf could not save this name.');
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save(name.trim() || null);
  }

  return <Modal titleId="rename-session-title" pending={pending} returnFocus={returnFocus} onClose={onCancel}>
    <h3 id="rename-session-title" tabIndex={-1} className="text-lg font-bold">{session.name ? 'Rename session' : 'Name this session'}</h3>
    <form noValidate className="mt-3" onSubmit={submit}>
      <label className="block text-sm font-semibold" htmlFor={inputId}>Session name</label>
      <input id={inputId} type="text" data-modal-initial maxLength={SESSION_NAME_MAX_LENGTH} autoComplete="off" disabled={pending}
        placeholder="For example, Trip planning" value={name}
        aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}
        className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm"
        onChange={event => { setName(event.target.value); setError(undefined); }} />
      {error && <p id={errorId} role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {pending && <p role="status" className="mt-2 text-sm text-slate-700">Saving…</p>}
      <Button type="submit" variant="primary" className="mt-4 w-full" disabled={pending}>Save name</Button>
      <div className="mt-2 flex gap-2">
        {session.name && <Button type="button" className="flex-1" disabled={pending} onClick={() => void save(null)}>Remove name</Button>}
        <Button type="button" className={session.name ? '' : 'flex-1'} disabled={pending} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  </Modal>;
}
