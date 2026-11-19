import {
  AUTO_BACKUP_STORAGE_KEY,
  AutoBackupStoreSchema,
  MAX_AUTO_BACKUPS,
  backupContentSignature,
  emptyAutoBackupStore,
  type AutoBackupEntry,
  type AutoBackupStoreData,
} from '@/domain/auto-backups';
import type { StorageAdapter } from './storage-adapter';

export type AutoBackupAddResult = 'saved' | 'unchanged' | 'space' | 'off';

/**
 * Rolling automatic backups under their own storage key. Reads that fail validation
 * are treated as "empty", and nothing here can write to the main database.
 */
export class AutoBackupStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StorageAdapter) {}

  private run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<AutoBackupStoreData> {
    const raw = await this.storage.get(AUTO_BACKUP_STORAGE_KEY);
    if (raw === undefined) return emptyAutoBackupStore();
    const parsed = AutoBackupStoreSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('LinkShelf ignored an invalid automatic backup store.');
      return emptyAutoBackupStore();
    }
    return parsed.data;
  }

  getState(): Promise<AutoBackupStoreData> {
    return this.run(() => this.read());
  }

  /** Turning the feature off deletes every automatic backup. */
  setEnabled(enabled: boolean): Promise<AutoBackupStoreData> {
    return this.run(async () => {
      const current = await this.read();
      const next = enabled ? { ...current, enabled: true } : emptyAutoBackupStore(false);
      await this.storage.set(AUTO_BACKUP_STORAGE_KEY, next);
      return next;
    });
  }

  /**
   * Adds a backup, dropping the oldest ones until everything fits `budgetBytes`.
   * Identical data is never stored twice, and an entry that cannot fit leaves the
   * existing backups alone.
   */
  add(entry: AutoBackupEntry, budgetBytes: number): Promise<AutoBackupAddResult> {
    return this.run(async () => {
      const current = await this.read();
      if (!current.enabled) return 'off';
      const newest = current.backups[0];
      if (newest && backupContentSignature(newest.backup) === backupContentSignature(entry.backup)) {
        if (current.lastProblem) await this.storage.set(AUTO_BACKUP_STORAGE_KEY, { ...current, lastProblem: undefined });
        return 'unchanged';
      }
      if (entry.bytes > budgetBytes) {
        await this.storage.set(AUTO_BACKUP_STORAGE_KEY, { ...current, lastProblem: 'space' });
        return 'space';
      }
      const kept = [entry];
      let total = entry.bytes;
      for (const older of current.backups) {
        if (kept.length >= MAX_AUTO_BACKUPS || total + older.bytes > budgetBytes) break;
        kept.push(older);
        total += older.bytes;
      }
      const { lastProblem: _cleared, ...rest } = current;
      await this.storage.set(AUTO_BACKUP_STORAGE_KEY, { ...rest, backups: kept });
      return 'saved';
    });
  }

  remove(id: string): Promise<AutoBackupStoreData> {
    return this.run(async () => {
      const current = await this.read();
      const next = { ...current, backups: current.backups.filter((entry) => entry.id !== id) };
      await this.storage.set(AUTO_BACKUP_STORAGE_KEY, next);
      return next;
    });
  }

  markProblem(problem: 'space' | 'failed'): Promise<void> {
    return this.run(async () => {
      const current = await this.read();
      if (current.enabled) await this.storage.set(AUTO_BACKUP_STORAGE_KEY, { ...current, lastProblem: problem });
    });
  }
}
