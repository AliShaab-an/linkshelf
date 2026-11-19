import type { Project, SavedLink } from '@/domain/schemas';
import { Button } from './ui/Button';
import type { ReactNode } from 'react';
import { Modal, type ReturnFocus } from './ui/Modal';
import { Dropdown } from './ui/Dropdown';

interface MoveLinkDialogProps { link: SavedLink; projects: Project[]; selectedProjectId: string; isMoving: boolean; feedback: ReactNode; returnFocus: ReturnFocus; onSelect(projectId: string): void; onCancel(): void; onConfirm(): void; }

export function MoveLinkDialog({ link, projects, selectedProjectId, isMoving, feedback, returnFocus, onSelect, onCancel, onConfirm }: MoveLinkDialogProps) {
  return <Modal titleId="move-link-title" pending={isMoving} returnFocus={returnFocus} onClose={onCancel}>
    <div aria-hidden="true" className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-violet-100 text-xl">↗</div>
    <h3 id="move-link-title" tabIndex={-1} className="text-lg font-bold">Move “{link.title}”</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">Choose its new project. The rest of its original parking session stays unchanged.</p>
    <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="move-project">Destination project</label>
    <Dropdown id="move-project" data-modal-initial className="mt-1.5 w-full" value={selectedProjectId} disabled={isMoving || projects.length === 0} options={projects.map(project => ({ value: project.id, label: project.name }))} onChange={onSelect} />
    {feedback}
    <div className="mt-5 flex gap-2"><Button variant="primary" className="flex-1" disabled={!selectedProjectId || isMoving} onClick={onConfirm}>{isMoving ? 'Moving...' : 'Move link'}</Button><Button disabled={isMoving} onClick={onCancel}>Cancel</Button></div>
  </Modal>;
}
