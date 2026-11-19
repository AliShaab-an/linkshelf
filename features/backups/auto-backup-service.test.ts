import { describe, expect, it, vi } from 'vitest';
import { createEmptyDatabase } from '@/domain/defaults';
import { AUTO_BACKUP_STORAGE_KEY, MAX_AUTO_BACKUPS } from '@/domain/auto-backups';
import type { LinkShelfBackup } from '@/domain/schemas';
import { AutoBackupStore } from '@/storage/auto-backup-store';
import type { StorageAdapter } from '@/storage/storage-adapter';
import { createAutoBackupService } from './auto-backup-service';

function setup(options: { quota?: number; used?: number } = {}) {
  const values = new Map<string, unknown>();
  const storage: StorageAdapter = { get: async (key) => values.get(key), set: async (key, value) => { values.set(key, structuredClone(value)); } };
  let clock = Date.parse('2026-11-19T10:00:00.000Z');
  let counter = 0;
  const data = { links: 0 };
  const exportBackup = async (): Promise<LinkShelfBackup> => {
    const database = createEmptyDatabase('2026-11-19T10:00:00.000Z');
    database.projects[0].name = `Inbox ${data.links}`;
    return { format: 'linkshelf-backup', schemaVersion: 3, exportedAt: new Date(clock).toISOString(), database };
  };
  const usage = { used: options.used ?? 100_000, quota: options.quota ?? 10_000_000 };
  const service = createAutoBackupService({
    store: new AutoBackupStore(storage),
    exportBackup,
    getUsage: async () => usage,
    now: () => new Date(clock).toISOString(),
    createId: () => `b-${++counter}`,
  });
  return { service, values, data, usage, advance: (hours: number) => { clock += hours * 3_600_000; } };
}

describe('automatic backups', () => {
  it('is on by default, creates a first backup when due and skips unchanged data', async () => {
    const { service, advance } = setup();
    expect((await service.list()).enabled).toBe(true);
    expect(await service.runIfDue()).toBe('saved');
    expect(await service.runIfDue()).toBe('not-due');
    advance(25);
    expect(await service.runIfDue()).toBe('unchanged');
    expect((await service.list()).backups).toHaveLength(1);
  });

  it('keeps a rolling window of the newest backups', async () => {
    const { service, data, advance } = setup();
    for (let index = 0; index < MAX_AUTO_BACKUPS + 2; index += 1) {
      data.links = index;
      advance(25);
      await service.run('daily');
    }
    const { backups } = await service.list();
    expect(backups).toHaveLength(MAX_AUTO_BACKUPS);
    expect(backups[0].createdAt > backups[1].createdAt).toBe(true);
  });

  it('records before-import backups with their reason', async () => {
    const { service } = setup();
    expect(await service.run('before-import')).toBe('saved');
    expect((await service.list()).backups[0]).toMatchObject({ reason: 'before-import', projects: 1, links: 0 });
  });

  it('stays inside the storage budget and reports not enough space', async () => {
    const { service, usage, data, advance } = setup({ quota: 500, used: 0 });
    expect(await service.run('daily')).toBe('space');
    expect(await service.list()).toMatchObject({ backups: [], problem: 'space' });
    usage.quota = 10_000_000;
    data.links = 1;
    advance(25);
    expect(await service.run('daily')).toBe('saved');
    expect((await service.list()).problem).toBeUndefined();
  });

  it('drops older backups to make room for the newest instead of exceeding the budget', async () => {
    const { service, usage, data, advance } = setup();
    for (const links of [1, 2, 3]) { data.links = links; advance(25); await service.run('daily'); }
    const one = (await service.list()).backups[0].bytes;
    usage.quota = Math.ceil((one * 2 + 100) / 0.6);
    usage.used = 0;
    data.links = 4; advance(25);
    expect(await service.run('daily')).toBe('saved');
    expect((await service.list()).backups.length).toBeLessThanOrEqual(2);
  });

  it('turning it off deletes backups, and turning it on makes one immediately', async () => {
    const { service, values } = setup();
    await service.run('daily');
    expect((await service.setEnabled(false))).toEqual({ enabled: false, backups: [] });
    expect(await service.run('daily')).toBe('off');
    expect((values.get(AUTO_BACKUP_STORAGE_KEY) as { backups: unknown[] }).backups).toEqual([]);
    expect((await service.setEnabled(true)).backups).toHaveLength(1);
  });

  it('returns a stored backup for restoring and removes one on request', async () => {
    const { service } = setup();
    await service.run('daily');
    const [{ id }] = (await service.list()).backups;
    expect((await service.get(id))?.entry.backup.format).toBe('linkshelf-backup');
    expect(await service.get('missing')).toBeUndefined();
    expect((await service.remove(id)).backups).toEqual([]);
  });

  it('never throws when the export fails and reports the problem', async () => {
    const values = new Map<string, unknown>();
    const storage: StorageAdapter = { get: async (key) => values.get(key), set: async (key, value) => { values.set(key, structuredClone(value)); } };
    const service = createAutoBackupService({
      store: new AutoBackupStore(storage), exportBackup: async () => { throw new Error('unreadable'); }, getUsage: async () => ({ used: 0, quota: 1e7 }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await service.run('daily')).toBe('failed');
    expect((await service.list()).problem).toBe('failed');
    warn.mockRestore();
  });

  it('treats an invalid stored value as empty and on', async () => {
    const { service, values } = setup();
    values.set(AUTO_BACKUP_STORAGE_KEY, { version: 9 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await service.list()).toEqual({ enabled: true, backups: [] });
    warn.mockRestore();
  });
});
