import { describe, expect, it, vi } from 'vitest';
import { createEmptyDatabase } from './defaults';
import { MAX_BACKUP_BYTES } from './constants';
import { readBackupFile, stringifyBackup } from './backup';

const backup = {
  format: 'linkshelf-backup', schemaVersion: 2, exportedAt: '2026-11-09T10:00:00.000Z',
  database: createEmptyDatabase('2026-11-09T10:00:00.000Z'),
};

describe('backup files', () => {
  it('reads both compact exports and existing formatted JSON files', async () => {
    for (const json of [stringifyBackup(backup), JSON.stringify(backup, null, 2)]) {
      expect(await readBackupFile(new File([json], 'backup.json'))).toEqual(backup);
    }
  });

  it.each(['', '{', '{"format":', 'null', '[1,2]', JSON.stringify({ ...backup, schemaVersion: 999 })])('rejects invalid or corrupted file %s', async (json) => {
    await expect(readBackupFile(new File([json], 'broken.json'))).rejects.toThrow(/JSON|valid LinkShelf backup|unsupported schema version/);
  });

  it('rejects oversized files before reading or parsing them', async () => {
    const file = { size: MAX_BACKUP_BYTES + 1, text: vi.fn() };
    await expect(readBackupFile(file)).rejects.toThrow('32 MiB');
    expect(file.text).not.toHaveBeenCalled();
  });

  it('accepts an existing formatted file exactly at the safety limit', async () => {
    const json = stringifyBackup(backup);
    const file = new File([json, ' '.repeat(MAX_BACKUP_BYTES - new TextEncoder().encode(json).length)], 'padded.json');
    expect(file.size).toBe(MAX_BACKUP_BYTES);
    expect(await readBackupFile(file)).toEqual(backup);
  });

  it('measures Unicode as UTF-8 bytes and preserves text exactly', async () => {
    const unicode = { ...backup, database: structuredClone(backup.database) };
    unicode.database.projects[0].description = 'مرحبا بالعالم 🌍 漢字 e\u0301'.repeat(1000);
    const json = stringifyBackup(unicode);
    expect(new TextEncoder().encode(json).length).toBeGreaterThan(json.length);
    expect(await readBackupFile(new File([json], 'unicode.json'))).toEqual(unicode);
    expect(() => stringifyBackup('🌍'.repeat(MAX_BACKUP_BYTES / 4))).toThrow('32 MiB');
  });

  it('rejects unserializable values safely', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => stringifyBackup(circular)).toThrow('serialized safely');
    expect(() => stringifyBackup(undefined)).toThrow('no readable data');
  });

  it('continues to accept valid version-1 files', async () => {
    const { displayDensity, defaultRestoreMode, ...settings } = backup.database.settings;
    const old = { ...backup, schemaVersion: 1, database: { ...backup.database, settings: { ...settings, schemaVersion: 1 } } };
    expect(await readBackupFile(new File([JSON.stringify(old)], 'v1.json'))).toEqual(backup);
  });
});
