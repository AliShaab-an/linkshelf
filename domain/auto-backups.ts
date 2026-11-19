import { z } from 'zod';
import type { LinkShelfBackup } from './schemas';

/** Separate from the main database so a problem here can never affect saved links. */
export const AUTO_BACKUP_STORAGE_KEY = 'linkshelfAutoBackups';
export const AUTO_BACKUP_ALARM_NAME = 'linkshelf-auto-backup';
export const AUTO_BACKUP_PERIOD_MINUTES = 24 * 60;
/** A backup is skipped at startup while the newest one is younger than this. */
export const AUTO_BACKUP_MIN_AGE_MS = 20 * 60 * 60 * 1000;
export const MAX_AUTO_BACKUPS = 5;
/** Backups may use at most this share of Chrome's local storage quota, leaving room for the real data. */
export const AUTO_BACKUP_QUOTA_SHARE = 0.6;

export const AutoBackupReasonSchema = z.enum(['daily', 'before-import']);
export type AutoBackupReason = z.infer<typeof AutoBackupReasonSchema>;

export const AutoBackupEntrySchema = z.strictObject({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  reason: AutoBackupReasonSchema,
  /** Serialized size, used to stay inside the storage budget. */
  bytes: z.number().int().nonnegative(),
  links: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
  /**
   * Only the envelope is checked when listing, which keeps reads cheap. The full
   * schema is enforced whenever a backup is previewed or imported.
   */
  backup: z.custom<LinkShelfBackup>((value) => typeof value === 'object' && value !== null &&
    (value as { format?: unknown }).format === 'linkshelf-backup' && typeof (value as { database?: unknown }).database === 'object'),
});
export type AutoBackupEntry = z.infer<typeof AutoBackupEntrySchema>;

export const AutoBackupStoreSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.boolean(),
  backups: z.array(AutoBackupEntrySchema).max(MAX_AUTO_BACKUPS),
  /** Set when the last attempt could not save, e.g. not enough space. */
  lastProblem: z.enum(['space', 'failed']).optional(),
});
export type AutoBackupStoreData = z.infer<typeof AutoBackupStoreSchema>;

export function emptyAutoBackupStore(enabled = true): AutoBackupStoreData {
  return { version: 1, enabled, backups: [] };
}

export interface AutoBackupSummary {
  id: string;
  createdAt: string;
  reason: AutoBackupReason;
  bytes: number;
  links: number;
  projects: number;
}

export function summarizeAutoBackup(entry: AutoBackupEntry): AutoBackupSummary {
  return {
    id: entry.id, createdAt: entry.createdAt, reason: entry.reason, bytes: entry.bytes,
    links: entry.links, projects: entry.projects,
  };
}

/** Everything except the export time, so unchanged data is not backed up again. */
export function backupContentSignature(backup: LinkShelfBackup): string {
  return JSON.stringify(backup.database);
}
