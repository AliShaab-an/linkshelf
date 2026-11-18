import { useId, useState, type ReactNode } from 'react';
import { MAX_TAG_LENGTH, MAX_TAGS_PER_LINK, normalizeTag, parseTags } from '@/domain/tags';
import type { SavedLink } from '@/domain/schemas';
import { setLinkTags } from '@/messaging/contracts';
import { Button } from './ui/Button';
import { Modal, type ReturnFocus } from './ui/Modal';

/** Splits comma-separated input; blank entries are ignored rather than rejected. */
export function parseTagInput(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

interface TagLinkDialogProps {
  link: SavedLink;
  suggestions: string[];
  returnFocus: ReturnFocus;
  /** Called with the saved link after the worker confirms the change. */
  onSaved(link: SavedLink): void;
  onCancel(): void;
}

export function TagLinkDialog({ link, suggestions, returnFocus, onSaved, onCancel }: TagLinkDialogProps) {
  const [value, setValue] = useState((link.tags ?? []).join(', '));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const parsed = parseTags(parseTagInput(value));
  const current = parsed.ok ? parsed.tags : [];
  const available = suggestions.filter((tag) => !current.includes(normalizeTag(tag))).slice(0, 6);
  const unchanged = parsed.ok && parsed.tags.join('\n') === (link.tags ?? []).join('\n');
  const problem = error ?? (parsed.ok ? undefined : parsed.message);

  function addSuggestion(tag: string) {
    const entries = parseTagInput(value);
    setValue([...entries, tag].join(', '));
    setError(undefined);
  }

  async function save() {
    if (pending || !parsed.ok) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await setLinkTags(link.id, parsed.tags);
      if (!response.success) throw new Error(response.error.message);
      onSaved(response.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LinkShelf could not save these tags.');
      setPending(false);
    }
  }

  const feedback: ReactNode = problem
    ? <p id={errorId} role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{problem}</p>
    : null;

  return <Modal titleId="tag-link-title" pending={pending} returnFocus={returnFocus} onClose={onCancel}>
    <h3 id="tag-link-title" tabIndex={-1} className="text-lg font-bold wrap-anywhere">Tags for “{link.title}”</h3>
    <form className="mt-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor={inputId}>Tags</label>
      <input id={inputId} data-modal-initial className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" dir="auto"
        autoComplete="off" spellCheck={false} value={value} disabled={pending}
        aria-describedby={problem ? `${helpId} ${errorId}` : helpId} aria-invalid={problem ? true : undefined}
        onChange={(event) => { setValue(event.target.value); setError(undefined); }} />
      <p id={helpId} className="mt-1.5 text-xs leading-5 text-slate-600">
        Separate tags with commas. Up to {MAX_TAGS_PER_LINK} tags, {MAX_TAG_LENGTH} characters each. Tags are saved in lowercase.
      </p>
      {current.length > 0 && <p className="mt-2 text-xs text-slate-700">Will be saved as: <span className="font-semibold wrap-anywhere" dir="auto">{current.join(', ')}</span></p>}
      {available.length > 0 && <div role="group" aria-label="Suggested tags" className="mt-3 flex flex-wrap gap-1.5">
        {available.map((tag) => <button key={tag} type="button" disabled={pending || current.length >= MAX_TAGS_PER_LINK}
          className="min-h-8 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45"
          aria-label={`Add tag ${tag}`} onClick={() => addSuggestion(tag)}>+ {tag}</button>)}
      </div>}
      {feedback}
      {pending && <p role="status" className="mt-2 text-sm text-slate-700">Saving tags…</p>}
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary" className="flex-1" disabled={pending || !parsed.ok || unchanged}>{pending ? 'Saving…' : 'Save tags'}</Button>
        <Button type="button" disabled={pending} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  </Modal>;
}
