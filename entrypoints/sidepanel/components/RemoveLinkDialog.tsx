import type { SavedLink } from '@/domain/schemas';
import { Button } from './ui/Button';
import type { ReactNode } from 'react';
import { Modal, type ReturnFocus } from './ui/Modal';

interface RemoveLinkDialogProps { link: SavedLink; isRemoving: boolean; feedback: ReactNode; returnFocus: ReturnFocus; onCancel(): void; onConfirm(): void; }

export function RemoveLinkDialog({ link, isRemoving, feedback, returnFocus, onCancel, onConfirm }: RemoveLinkDialogProps) {
  return <Modal titleId="remove-link-title" pending={isRemoving} returnFocus={returnFocus} onClose={onCancel}>
    <div aria-hidden="true" className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-red-100 text-xl font-black text-red-700">!</div>
    <h3 id="remove-link-title" tabIndex={-1} className="text-lg font-bold text-red-900">Remove “{link.title}”?</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">It will disappear from active and archived lists. LinkShelf keeps a local removed-state record instead of silently deleting it.</p>
    {feedback}
    <div className="mt-5 flex flex-wrap justify-end gap-2"><Button data-modal-initial disabled={isRemoving} onClick={onCancel}>Cancel</Button><Button variant="danger" disabled={isRemoving} onClick={onConfirm}>{isRemoving ? 'Removing...' : 'Remove link'}</Button></div>
  </Modal>;
}
