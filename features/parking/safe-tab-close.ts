import type { BrowserTabSnapshot } from './park-current-tab';

export interface SafeTabCloseDependencies {
  getTab(tabId: number): Promise<BrowserTabSnapshot>;
  closeTab(tabId: number): Promise<void>;
  hasTabChanged?(tabId: number): boolean;
}

export async function closeSavedTab(snapshot: BrowserTabSnapshot, dependencies: SafeTabCloseDependencies): Promise<'closed' | 'changed' | 'unavailable' | 'failed'> {
  let current: BrowserTabSnapshot;
  try {
    current = await dependencies.getTab(snapshot.id!);
  } catch {
    return 'unavailable';
  }
  if (dependencies.hasTabChanged?.(snapshot.id!) || snapshot.pendingUrl || current.pendingUrl ||
      snapshot.status === 'loading' || current.status === 'loading' ||
      current.id !== snapshot.id || current.url !== snapshot.url ||
      current.windowId !== snapshot.windowId || current.pinned !== snapshot.pinned) return 'changed';
  // Chrome has no conditional remove API. Keep this call immediately after validation.
  try {
    await dependencies.closeTab(snapshot.id!);
    return 'closed';
  } catch {
    return 'failed';
  }
}

interface TabEvent<Callback> {
  addListener(callback: Callback): void;
  removeListener(callback: Callback): void;
}

interface TabChangeEvents {
  onUpdated?: TabEvent<(tabId: number, change: { url?: string; status?: string; pinned?: boolean }) => void>;
  onRemoved?: TabEvent<(tabId: number) => void>;
  onDetached?: TabEvent<(tabId: number) => void>;
  onReplaced?: TabEvent<(addedId: number, removedId: number) => void>;
}

export async function watchTabSnapshots<T>(events: TabChangeEvents, ids: number[], action: (hasChanged: (id: number) => boolean) => Promise<T>): Promise<T> {
  const watched = new Set(ids);
  const changed = new Set<number>();
  const invalidate = (id: number) => { if (watched.has(id)) changed.add(id); };
  const onUpdated = (id: number, change: { url?: string; status?: string; pinned?: boolean }) => {
    if (change.url !== undefined || change.status === 'loading' || change.pinned !== undefined) invalidate(id);
  };
  const onReplaced = (_added: number, removed: number) => invalidate(removed);
  try {
    events.onUpdated?.addListener(onUpdated);
    events.onRemoved?.addListener(invalidate);
    events.onDetached?.addListener(invalidate);
    events.onReplaced?.addListener(onReplaced);
    return await action((id) => changed.has(id));
  } finally {
    events.onUpdated?.removeListener(onUpdated);
    events.onRemoved?.removeListener(invalidate);
    events.onDetached?.removeListener(invalidate);
    events.onReplaced?.removeListener(onReplaced);
  }
}
