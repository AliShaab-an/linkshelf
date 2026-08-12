import type { SavedLink } from '@/domain/schemas';
import type { BookmarkFolderOption, NativeBookmarkResult } from '@/messaging/contracts';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface BookmarkLinkDialogProps {
  link: SavedLink; folders: BookmarkFolderOption[]; selectedFolderId: string;
  duplicate?: NativeBookmarkResult; isLoadingFolders: boolean; isSaving: boolean;
  onSelectFolder(folderId: string): void; onCancel(): void; onConfirm(): void; onOpenDuplicate(): void;
}

export function BookmarkLinkDialog({ link, folders, selectedFolderId, duplicate, isLoadingFolders, isSaving, onSelectFolder, onCancel, onConfirm, onOpenDuplicate }: BookmarkLinkDialogProps) {
  return <Modal titleId="bookmark-dialog-title" onClose={isSaving ? () => undefined : onCancel}>
    <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-blue-100 text-xl">🔖</div>
    <h3 id="bookmark-dialog-title" className="text-lg font-bold">Keep “{link.title}” permanently?</h3>
    {duplicate ? <>
      <p className="mt-2 text-sm leading-6 text-amber-800">Chrome already has this URL saved as “{duplicate.title}”. The LinkShelf link remains parked.</p>
      <div className="mt-5 flex gap-2"><Button variant="primary" className="flex-1" onClick={onOpenDuplicate}>Open existing</Button><Button onClick={onCancel}>Close</Button></div>
    </> : <>
      <p className="mt-2 text-sm leading-6 text-slate-600">This creates a native Chrome bookmark. LinkShelf keeps its history, but removes the link from your parked list.</p>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="bookmark-folder">Destination folder</label>
      <select id="bookmark-folder" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:opacity-50" disabled={isLoadingFolders || isSaving} value={selectedFolderId} onChange={(event) => onSelectFolder(event.target.value)}>
        {isLoadingFolders && <option value="">Loading folders...</option>}
        {!isLoadingFolders && folders.length === 0 && <option value="">No bookmark folders found</option>}
        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
      </select>
      <div className="mt-5 flex gap-2"><Button variant="primary" className="flex-1" disabled={!selectedFolderId || isLoadingFolders || isSaving} onClick={onConfirm}>{isSaving ? 'Saving...' : 'Create bookmark'}</Button><Button disabled={isSaving} onClick={onCancel}>Cancel</Button></div>
    </>}
  </Modal>;
}
