import type { SavedLink } from '@/domain/schemas';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface RemoveLinkDialogProps { link: SavedLink; isRemoving: boolean; onCancel(): void; onConfirm(): void; }

export function RemoveLinkDialog({ link, isRemoving, onCancel, onConfirm }: RemoveLinkDialogProps) {
  return <Modal titleId="remove-link-title" onClose={isRemoving ? () => undefined : onCancel}>
    <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-red-100 text-xl font-black text-red-700">!</div>
    <h3 id="remove-link-title" className="text-lg font-bold text-red-900">Remove “{link.title}”?</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">It will disappear from active and archived lists. LinkShelf keeps a local removed-state record instead of silently deleting it.</p>
    <div className="mt-5 flex justify-end gap-2"><Button disabled={isRemoving} onClick={onCancel}>Cancel</Button><Button variant="danger" disabled={isRemoving} onClick={onConfirm}>{isRemoving ? 'Removing...' : 'Remove link'}</Button></div>
  </Modal>;
}
