import {
  MAX_SNAPSHOTS,
  SNAPSHOT_STORAGE_KEY,
  SnapshotStoreSchema,
  buildSnapshot,
  emptySnapshotStore,
  snapshotSignature,
  type Snapshot,
  type SnapshotStoreData,
} from '@/domain/snapshots';
import type { StorageAdapter } from './storage-adapter';

/**
 * Rolling window snapshots under their own storage key. Nothing here touches the main
 * database, so a failure or an invalid value in this key can never affect saved links.
 * Reads that fail validation are treated as "feature off and empty".
 */
export class SnapshotStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: StorageAdapter,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  /** Serializes read-modify-write cycles so concurrent events cannot lose each other's changes. */
  private run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<SnapshotStoreData> {
    const raw = await this.storage.get(SNAPSHOT_STORAGE_KEY);
    if (raw === undefined) return emptySnapshotStore();
    const parsed = SnapshotStoreSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('LinkShelf ignored an invalid snapshot store.');
      return emptySnapshotStore();
    }
    return parsed.data;
  }

  getState(): Promise<SnapshotStoreData> {
    return this.run(() => this.read());
  }

  /** Turning the feature off deletes every stored snapshot. */
  setEnabled(enabled: boolean): Promise<SnapshotStoreData> {
    return this.run(async () => {
      const current = await this.read();
      const next = enabled ? { ...current, enabled: true } : emptySnapshotStore(false);
      await this.storage.set(SNAPSHOT_STORAGE_KEY, next);
      return next;
    });
  }

  clear(): Promise<SnapshotStoreData> {
    return this.run(async () => {
      const next = emptySnapshotStore((await this.read()).enabled);
      await this.storage.set(SNAPSHOT_STORAGE_KEY, next);
      return next;
    });
  }

  /** Replaces the working copy. An empty capture never erases the last real state. */
  updateWorking(snapshot: Snapshot | undefined): Promise<boolean> {
    return this.run(async () => {
      const current = await this.read();
      if (!current.enabled || !snapshot) return false;
      await this.storage.set(SNAPSHOT_STORAGE_KEY, { ...current, working: snapshot });
      return true;
    });
  }

  /** Cuts the closed window out of the working copy into history. */
  commitClosedWindow(windowId: number): Promise<boolean> {
    return this.run(async () => {
      const current = await this.read();
      const closed = current.working?.windows.find((window) => window.windowId === windowId);
      if (!current.enabled || !current.working || !closed) return false;
      const remaining = current.working.windows.filter((window) => window !== closed);
      const snapshot = buildSnapshot([closed], { id: this.createId(), capturedAt: this.now(), reason: 'window-closed' });
      const working = remaining.length ? { ...current.working, windows: remaining } : undefined;
      return this.commit(current, snapshot, working);
    });
  }

  /** Saves the whole working copy as the previous browser session, e.g. at startup. */
  commitPreviousSession(): Promise<boolean> {
    return this.run(async () => {
      const current = await this.read();
      if (!current.enabled || !current.working) return false;
      const windows = current.working.windows.map(({ tabs }) => ({ tabs }));
      const snapshot = buildSnapshot(windows, { id: this.createId(), capturedAt: this.now(), reason: 'previous-session' });
      return this.commit(current, snapshot, undefined);
    });
  }

  private async commit(current: SnapshotStoreData, snapshot: Snapshot | undefined, working: Snapshot | undefined): Promise<boolean> {
    const duplicate = snapshot && current.history[0] && snapshotSignature(current.history[0]) === snapshotSignature(snapshot);
    const history = snapshot && !duplicate ? [snapshot, ...current.history].slice(0, MAX_SNAPSHOTS) : current.history;
    await this.storage.set(SNAPSHOT_STORAGE_KEY, { version: 1, enabled: true, ...(working ? { working } : {}), history });
    return Boolean(snapshot && !duplicate);
  }
}
