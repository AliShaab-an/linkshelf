import { describe, expect, it } from 'vitest';
import { readBackupFile, stringifyBackup } from '@/domain/backup';
import { MAX_BACKUP_BYTES } from '@/domain/constants';
import { createEmptyDatabase } from '@/domain/defaults';
import type { LinkShelfDatabase } from '@/domain/schemas';
import { DATABASE_STORAGE_KEY, LinkShelfRepository } from './repository';
import type { StorageAdapter } from './storage-adapter';

const now = '2026-11-09T10:00:00.000Z';

class BackupStorage implements StorageAdapter {
  value?: unknown;
  writes = 0;
  failure?: 'before' | 'after' | 'quota' | 'always';

  async get() { return structuredClone(this.value); }
  async set(_key: string, value: unknown) {
    this.writes++;
    const failure = this.failure;
    if (failure !== 'always') this.failure = undefined;
    if (failure === 'quota') throw new Error('QUOTA_BYTES quota exceeded');
    if (failure === 'before' || failure === 'always') throw new Error('Storage unavailable');
    this.value = structuredClone(value);
    if (failure === 'after') throw new Error('Write acknowledgement failed');
  }
}

function database(): LinkShelfDatabase {
  const value = createEmptyDatabase(now);
  value.sessions.push({ id: 'import-session', projectId: 'inbox', createdAt: now, updatedAt: now });
  value.links.push({
    id: 'import-link', projectId: 'inbox', sessionId: 'import-session', title: 'Research',
    url: 'https://example.com/research', normalizedUrl: 'https://example.com/research', domain: 'example.com',
    status: 'parked', pinnedBeforeParking: false, createdAt: now, updatedAt: now, note: '',
  });
  return value;
}

async function sourceForSize(bytes: number) {
  const storage = new BackupStorage();
  const value = database();
  await storage.set(DATABASE_STORAGE_KEY, value);
  const source = new LinkShelfRepository(storage, () => now);
  const base = stringifyBackup(await source.exportBackup());
  value.links[0].note = 'x'.repeat(bytes - new TextEncoder().encode(base).length);
  // Use a fresh repository after seeding, as real storage is owned by one worker.
  await storage.set(DATABASE_STORAGE_KEY, value);
  return new LinkShelfRepository(storage, () => now);
}

describe('backup export/file/import round trips', () => {
  it.each(['merge', 'replace'] as const)('preserves IDs, relationships, reminders, timestamps, metadata and every lifecycle state in %s mode', async (mode) => {
    const sourceStorage = new BackupStorage();
    const value = database();
    value.projects.push({
      id: 'research-project', name: 'Research 🌍', description: 'ملاحظات', color: 'blue',
      isInbox: false, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: now,
    });
    value.sessions.push({
      id: 'research-session', projectId: 'research-project', note: 'Shared research note',
      reminderAt: '2026-12-01T09:00:00.000Z', sourceWindowId: 12,
      createdAt: '2026-08-02T09:00:00.000Z', updatedAt: now,
    });
    value.links = (['parked', 'archived', 'restored', 'removed'] as const).map((status, index) => ({
      ...value.links[0], id: `history-${status}`, status,
      sessionId: index % 2 === 0 ? 'research-session' : 'import-session',
      projectId: index % 2 === 0 ? 'research-project' : 'inbox',
      note: 'مرحبا 🌍 漢字 e\u0301', reminderAt: '2026-12-01T09:00:00.000Z',
      reminderNotifiedAt: '2026-08-10T09:00:00.000Z', originalIndex: index,
      originalGroup: { title: 'Research tabs', color: 'blue' }, pinnedBeforeParking: true,
      faviconUrl: 'https://example.com/favicon.ico',
      createdAt: '2026-08-02T09:00:00.000Z', updatedAt: now,
      ...(status === 'archived' ? { archivedAt: '2026-08-03T09:00:00.000Z' } : {}),
      ...(status === 'restored' ? { restoredAt: '2026-08-04T09:00:00.000Z' } : {}),
      ...(status === 'removed' ? {
        removedAt: '2026-08-05T09:00:00.000Z', bookmarkId: 'chrome-bookmark', bookmarkedAt: '2026-08-05T09:00:00.000Z',
      } : {}),
    }));
    value.settings = { ...value.settings, defaultProjectId: 'research-project', displayDensity: 'compact', defaultRestoreMode: 'unloaded' };
    await sourceStorage.set(DATABASE_STORAGE_KEY, value);
    const source = new LinkShelfRepository(sourceStorage, () => now);
    const exported = await source.exportBackup();
    const parsed = await readBackupFile(new File([stringifyBackup(exported)], 'history.json'));
    const targetStorage = new BackupStorage();
    const target = new LinkShelfRepository(targetStorage, () => now);
    const current = await target.parkTab({ title: 'Existing content', url: 'https://existing.example.com', pinnedBeforeParking: false });
    const before = await target.getDatabase();
    const preview = await target.previewImportBackup(parsed, mode);
    await target.importBackup(parsed, mode, preview.revisionToken);
    const result = await target.getDatabase();
    if (mode === 'replace') {
      expect(result).toEqual(value);
    } else {
      expect(result.projects).toEqual(value.projects);
      expect(result.sessions).toEqual([current.session, ...value.sessions]);
      expect(result.links).toEqual([current.link, ...value.links]);
      expect(result.settings).toEqual(before.settings);
    }
    expect(await new LinkShelfRepository(targetStorage).getDatabase()).toEqual(result);
    expect(await source.getDatabase()).toEqual(value);
  });

  it('imports an actual legacy pretty-printed export that crosses 5 MiB because of whitespace', async () => {
    const source = await sourceForSize(5 * 1024 * 1024 - 1);
    const exported = await source.exportBackup();
    const file = new File([JSON.stringify(exported, null, 2)], 'legacy-formatted.json');
    expect(file.size).toBeGreaterThan(5 * 1024 * 1024);
    const parsed = await readBackupFile(file);
    for (const mode of ['merge', 'replace'] as const) {
      const target = new LinkShelfRepository(new BackupStorage(), () => now);
      const preview = await target.previewImportBackup(parsed, mode);
      await target.importBackup(parsed, mode, preview.revisionToken);
      expect(await target.getDatabase()).toEqual(exported.database);
    }
  });

  for (const mode of ['merge', 'replace'] as const) {
    it.each([2048, 5 * 1024 * 1024 - 1, 5 * 1024 * 1024, 5 * 1024 * 1024 + 1, 6 * 1024 * 1024])(
      `${mode} round trips a %i-byte export, including long notes around the old limit`, async (bytes) => {
        const source = await sourceForSize(bytes);
        const exported = await source.exportBackup();
        const json = stringifyBackup(exported);
        const file = new File([json], 'backup.json');
        expect(file.size).toBe(bytes);
        const parsed = await readBackupFile(file);
        const target = new LinkShelfRepository(new BackupStorage(), () => now);
        const preview = await target.previewImportBackup(parsed, mode);
        await target.importBackup(parsed, mode, preview.revisionToken);
        expect(await target.getDatabase()).toEqual(exported.database);
        expect(await target.exportBackup()).toEqual(exported);
      },
    );
  }

  it('round trips 10,000 links and Unicode notes in both import modes', async () => {
    const storage = new BackupStorage();
    const value = database();
    value.sessions[0].note = 'جلسة بحث 🌍';
    value.links = Array.from({ length: 10_000 }, (_, index) => ({
      ...value.links[0], id: `link-${index}`, title: `بحث ${index} 🌍`, note: '漢字 e\u0301 مرحبا 🌍'.repeat(3),
    }));
    await storage.set(DATABASE_STORAGE_KEY, value);
    const source = new LinkShelfRepository(storage, () => now);
    const exported = await source.exportBackup();
    const parsed = await readBackupFile(new File([stringifyBackup(exported)], 'large.json'));
    for (const mode of ['merge', 'replace'] as const) {
      const target = new LinkShelfRepository(new BackupStorage(), () => now);
      const preview = await target.previewImportBackup(parsed, mode);
      await target.importBackup(parsed, mode, preview.revisionToken);
      expect(await target.getDatabase()).toEqual(value);
    }
  }, 15_000);

  it('preserves current records and settings while merging a large backup', async () => {
    const source = await sourceForSize(6 * 1024 * 1024);
    const backup = await source.exportBackup();
    const target = new LinkShelfRepository(new BackupStorage(), () => now);
    const current = await target.parkTab({ title: 'Existing', url: 'https://existing.example.com', pinnedBeforeParking: false });
    const settings = await target.getSettings();
    await target.updateSettings({ ...settings, notificationsEnabled: false });
    const preview = await target.previewImportBackup(backup, 'merge');
    await target.importBackup(backup, 'merge', preview.revisionToken);
    const merged = await target.getDatabase();
    expect(merged.links).toHaveLength(2);
    expect(merged.links).toContainEqual(current.link);
    expect(merged.settings.notificationsEnabled).toBe(false);
  });

  for (const mode of ['merge', 'replace'] as const) {
    it.each(['before', 'after', 'quota'] as const)(`rolls back a large failed ${mode} import (%s) and permits a retry`, async (failure) => {
      const source = await sourceForSize(6 * 1024 * 1024);
      const backup = await source.exportBackup();
      const storage = new BackupStorage();
      const target = new LinkShelfRepository(storage, () => now);
      await target.parkTab({ title: 'Existing data', url: 'https://existing.example.com', pinnedBeforeParking: false });
      const before = await target.getDatabase();
      const preview = await target.previewImportBackup(backup, mode);
      storage.failure = failure;
      await expect(target.importBackup(backup, mode, preview.revisionToken)).rejects.toThrow(
        failure === 'quota' ? 'available Chrome storage space' : /Storage unavailable|acknowledgement/,
      );
      expect(await target.getDatabase()).toEqual(before);
      expect(storage.value).toEqual(before);
      expect(await new LinkShelfRepository(storage).getDatabase()).toEqual(before);
      await target.importBackup(backup, mode, preview.revisionToken);
      const imported = await target.getDatabase();
      expect(imported.links).toContainEqual(backup.database.links[0]);
      expect(imported.links).toHaveLength(mode === 'merge' ? 2 : 1);
    });
  }

  it('reports when rollback itself fails instead of claiming data was preserved', async () => {
    const source = await sourceForSize(2048);
    const backup = await source.exportBackup();
    const storage = new BackupStorage();
    const target = new LinkShelfRepository(storage, () => now);
    const preview = await target.previewImportBackup(backup, 'replace');
    storage.failure = 'always';
    await expect(target.importBackup(backup, 'replace', preview.revisionToken)).rejects.toThrow('could not verify rollback');
  });

  it('rejects corrupted relationships without writing existing data', async () => {
    const source = await sourceForSize(2048);
    const backup = await source.exportBackup();
    backup.database.links[0].sessionId = 'missing-session';
    const storage = new BackupStorage();
    const target = new LinkShelfRepository(storage, () => now);
    const before = await target.getDatabase();
    const writes = storage.writes;
    for (const mode of ['merge', 'replace'] as const) {
      await expect(target.previewImportBackup(backup, mode)).rejects.toThrow('not a valid LinkShelf backup');
    }
    expect(storage.writes).toBe(writes);
    expect(storage.value).toEqual(before);
  });

  it('never successfully exports a file beyond the importer safety bound', async () => {
    const storage = new BackupStorage();
    const value = database();
    value.links[0].note = 'x'.repeat(MAX_BACKUP_BYTES);
    await storage.set(DATABASE_STORAGE_KEY, value);
    const source = new LinkShelfRepository(storage, () => now);
    await expect(source.exportBackup()).rejects.toThrow('32 MiB');
    expect(storage.writes).toBe(1);
    expect(await source.getDatabase()).toEqual(value);
  });
});
