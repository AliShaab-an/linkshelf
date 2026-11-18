import {
  buildSnapshot,
  countTabs,
  summarizeSnapshot,
  type RawSnapshotWindow,
  type SnapshotStoreData,
  type SnapshotSummary,
} from '@/domain/snapshots';
import type { SnapshotStore } from '@/storage/snapshot-store';

export interface SnapshotWindowsApi {
  /** Normal browser windows with their tabs. Incognito windows are only visible if the user allowed them. */
  getAll(): Promise<RawSnapshotWindow[]>;
}

export interface SnapshotTabsApi {
  create(input: { url: string; active: boolean; windowId: number }): Promise<unknown>;
}

export type RestoreSnapshotResult =
  | { success: true; opened: number; failed: number; total: number }
  | { success: false; opened: number; error: { code: 'SNAPSHOT_NOT_FOUND' | 'TAB_OPEN_FAILED'; message: string } };

export function createSnapshotService(options: {
  store: SnapshotStore;
  windows: SnapshotWindowsApi;
  now?: () => string;
  createId?: () => string;
}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());

  /** Refreshes the working copy. Failures are diagnostics only and never reach the main database. */
  async function capture(): Promise<void> {
    try {
      if (!(await options.store.getState()).enabled) return;
      const snapshot = buildSnapshot(await options.windows.getAll(), { id: createId(), capturedAt: now(), reason: 'working' });
      await options.store.updateWorking(snapshot);
    } catch (error) {
      console.warn('LinkShelf could not refresh its window snapshot:', error);
    }
  }

  async function windowClosed(windowId: number): Promise<void> {
    try {
      await options.store.commitClosedWindow(windowId);
    } catch (error) {
      console.warn('LinkShelf could not save a closed-window snapshot:', error);
    }
  }

  /** At browser startup the working copy still describes the previous session. */
  async function started(): Promise<void> {
    try {
      await options.store.commitPreviousSession();
    } catch (error) {
      console.warn('LinkShelf could not save the previous-session snapshot:', error);
    }
    await capture();
  }

  async function summaries(): Promise<{ enabled: boolean; snapshots: SnapshotSummary[] }> {
    const state: SnapshotStoreData = await options.store.getState();
    return { enabled: state.enabled, snapshots: state.history.map(summarizeSnapshot) };
  }

  async function setEnabled(enabled: boolean) {
    await options.store.setEnabled(enabled);
    if (enabled) await capture();
    return summaries();
  }

  /**
   * Opens every snapshot tab in the target window as a normal background tab. Tabs are not
   * discarded after creation: Chrome drops the address of a tab discarded before it loads.
   */
  async function restore(snapshotId: string, windowId: number, tabs: SnapshotTabsApi): Promise<RestoreSnapshotResult> {
    const snapshot = (await options.store.getState()).history.find((item) => item.id === snapshotId);
    if (!snapshot) {
      return { success: false, opened: 0, error: { code: 'SNAPSHOT_NOT_FOUND', message: 'This snapshot no longer exists. Refresh the list.' } };
    }
    const total = countTabs(snapshot);
    let opened = 0;
    for (const url of snapshot.windows.flatMap((window) => window.tabs.map((tab) => tab.url))) {
      try {
        await tabs.create({ url, active: false, windowId });
        opened += 1;
      } catch {
        // Counted as failed below; the remaining tabs are still attempted.
      }
    }
    if (opened === 0) {
      return { success: false, opened, error: { code: 'TAB_OPEN_FAILED', message: 'Chrome did not confirm opening any tabs. Nothing was restored.' } };
    }
    return { success: true, opened, failed: total - opened, total };
  }

  return { capture, windowClosed, started, summaries, setEnabled, restore, clear: () => options.store.clear() };
}

export type SnapshotService = ReturnType<typeof createSnapshotService>;
