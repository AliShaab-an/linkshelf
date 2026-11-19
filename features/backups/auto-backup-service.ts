import {
  AUTO_BACKUP_MIN_AGE_MS,
  AUTO_BACKUP_QUOTA_SHARE,
  summarizeAutoBackup,
  type AutoBackupEntry,
  type AutoBackupReason,
  type AutoBackupSummary,
} from '@/domain/auto-backups';
import type { LinkShelfBackup } from '@/domain/schemas';
import type { AutoBackupStore } from '@/storage/auto-backup-store';

export type AutoBackupOutcome = 'saved' | 'unchanged' | 'space' | 'failed' | 'off';

export interface AutoBackupList {
  enabled: boolean;
  backups: AutoBackupSummary[];
  problem?: 'space' | 'failed';
}

export interface AutoBackupDeps {
  store: AutoBackupStore;
  exportBackup: () => Promise<LinkShelfBackup>;
  /** Chrome's local storage budget and what is currently used by everything stored. */
  getUsage: () => Promise<{ used: number; quota: number }>;
  now?: () => string;
  createId?: () => string;
}

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function createAutoBackupService(deps: AutoBackupDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const createId = deps.createId ?? (() => crypto.randomUUID());

  async function list(): Promise<AutoBackupList> {
    const state = await deps.store.getState();
    return {
      enabled: state.enabled,
      backups: state.backups.map(summarizeAutoBackup),
      ...(state.lastProblem ? { problem: state.lastProblem } : {}),
    };
  }

  /** Never throws: a failed backup must not affect whatever triggered it. */
  async function run(reason: AutoBackupReason): Promise<AutoBackupOutcome> {
    try {
      const state = await deps.store.getState();
      if (!state.enabled) return 'off';
      const backup = await deps.exportBackup();
      const bytes = byteLength(backup);
      const { used, quota } = await deps.getUsage();
      // Space used by everything except the backups themselves.
      const own = state.backups.reduce((sum, entry) => sum + entry.bytes, 0);
      const budget = Math.min(quota * AUTO_BACKUP_QUOTA_SHARE, quota * 0.8 - Math.max(0, used - own));
      const entry: AutoBackupEntry = {
        id: createId(), createdAt: now(), reason, bytes,
        links: backup.database.links.length, projects: backup.database.projects.length, backup,
      };
      return await deps.store.add(entry, Math.max(0, budget));
    } catch (error) {
      console.warn('LinkShelf could not create an automatic backup:', error);
      await deps.store.markProblem('failed').catch(() => undefined);
      return 'failed';
    }
  }

  /** Runs the daily backup unless a recent one already exists. */
  async function runIfDue(): Promise<AutoBackupOutcome | 'not-due'> {
    const state = await deps.store.getState().catch(() => undefined);
    if (!state?.enabled) return 'off';
    const newest = state.backups[0];
    if (newest && Date.parse(now()) - Date.parse(newest.createdAt) < AUTO_BACKUP_MIN_AGE_MS) return 'not-due';
    return run('daily');
  }

  async function setEnabled(enabled: boolean): Promise<AutoBackupList> {
    await deps.store.setEnabled(enabled);
    if (enabled) await run('daily');
    return list();
  }

  async function remove(id: string): Promise<AutoBackupList> {
    await deps.store.remove(id);
    return list();
  }

  async function get(id: string): Promise<{ entry: AutoBackupEntry } | undefined> {
    const entry = (await deps.store.getState()).backups.find((candidate) => candidate.id === id);
    return entry ? { entry } : undefined;
  }

  return { list, run, runIfDue, setEnabled, remove, get };
}

export type AutoBackupService = ReturnType<typeof createAutoBackupService>;
