import type { SavedLink } from '@/domain/schemas';
import type { BookmarkFolderOption, NativeBookmarkResult } from '@/messaging/contracts';
import { Button } from './ui/Button';
import type { ReactNode } from 'react';
import { Modal, type ReturnFocus } from './ui/Modal';
import { Select } from './ui/Select';

interface BookmarkLinkDialogProps {
  link: SavedLink; folders: BookmarkFolderOption[]; selectedFolderId: string;
  duplicate?: NativeBookmarkResult; isLoadingFolders: boolean; isSaving: boolean;
  feedback: ReactNode; returnFocus: ReturnFocus;
  onSelectFolder(folderId: string): void; onCancel(): void; onConfirm(): void; onOpenDuplicate(): void;
}

export function BookmarkLinkDialog({ link, folders, selectedFolderId, duplicate, isLoadingFolders, isSaving, feedback, returnFocus, onSelectFolder, onCancel, onConfirm, onOpenDuplicate }: BookmarkLinkDialogProps) {
  return <Modal titleId="bookmark-dialog-title" pending={isSaving} returnFocus={returnFocus} onClose={onCancel}>
    <div aria-hidden="true" className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-blue-100 text-xl">🔖</div>
    <h3 id="bookmark-dialog-title" tabIndex={-1} className="text-lg font-bold">Keep “{link.title}” permanently?</h3>
    <div role="status">{duplicate && <p className="mt-2 text-sm leading-6 text-amber-800">Chrome already has this URL saved as “{duplicate.title}”. The LinkShelf link remains parked.</p>}</div>
    {feedback}
    {duplicate ? <>
      <div className="mt-5 flex gap-2"><Button variant="primary" className="flex-1" disabled={isSaving} onClick={onOpenDuplicate}>Open existing</Button><Button disabled={isSaving} onClick={onCancel}>Close</Button></div>
    </> : <>
      <p className="mt-2 text-sm leading-6 text-slate-600">This saves the link in your Chrome bookmarks. LinkShelf keeps its history and removes it from your parked list.</p>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="bookmark-folder">Destination folder</label>
      <Select id="bookmark-folder" className="mt-1.5 w-full" disabled={isLoadingFolders || isSaving || folders.length === 0} value={selectedFolderId} onChange={(event) => onSelectFolder(event.target.value)}>
        {isLoadingFolders && <option value="">Loading folders...</option>}
        {!isLoadingFolders && folders.length === 0 && <option value="">No bookmark folders found</option>}
        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
      </Select>
      <div className="mt-5 flex gap-2"><Button variant="primary" className="flex-1" disabled={!selectedFolderId || isLoadingFolders || isSaving} onClick={onConfirm}>{isSaving ? 'Saving...' : 'Create bookmark'}</Button><Button disabled={isSaving} onClick={onCancel}>Cancel</Button></div>
    </>}
  </Modal>;
}
