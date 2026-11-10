import { describe, expect, it, vi } from 'vitest';
import { createEmptyDatabase } from '@/domain/defaults';
import { getIntegrityDiagnostics } from '@/domain/integrity';
import { stringifyRecoveryExport, storedValuesEqual } from '@/domain/recovery';
import { LinkShelfBackupSchema, LinkShelfDatabaseSchema, migrateLinkShelfDatabase, parseSupportedLinkShelfBackup, type LinkShelfDatabase } from '@/domain/schemas';
import { DATABASE_STORAGE_KEY, LinkShelfRepository, StorageIntegrityError, StorageValidationError } from './repository';

const NOW = '2026-11-09T10:00:00.000Z';
function fixture(count = 4): LinkShelfDatabase {
  const database = createEmptyDatabase(NOW);
  database.sessions.push({ id: 'session', projectId: 'inbox', note: 'Private shared note', reminderAt: '2099-01-01T00:00:00.000Z', createdAt: NOW, updatedAt: NOW });
  database.links = Array.from({ length: count }, (_, index) => ({
    id: `link-${index}`, projectId: 'inbox', sessionId: 'session', title: `Private title ${index}`,
    url: `https://private.example/${index}`, normalizedUrl: `https://private.example/${index}`, domain: 'private.example',
    note: 'Private note 🌍', status: (['parked', 'archived', 'restored', 'removed'] as const)[index % 4],
    reminderAt: '2099-01-01T00:00:00.000Z', reminderNotifiedAt: NOW,
    originalIndex: index, pinnedBeforeParking: false, originalGroup: { title: 'Group', color: 'blue' },
    createdAt: NOW, updatedAt: NOW,
    ...(index === 3 ? { bookmarkId: 'bookmark', bookmarkedAt: NOW, removedAt: NOW } : {}),
  }));
  return database;
}
function backup(database = fixture()) { return { format: 'linkshelf-backup' as const, schemaVersion: 2 as const, exportedAt: NOW, database }; }
function legacy(database: LinkShelfDatabase) {
  const { displayDensity: _density, defaultRestoreMode: _mode, ...settings } = database.settings;
  return { ...database, settings: { ...settings, schemaVersion: 1 } };
}
class MemoryStorage {
  value: unknown;
  readonly get = vi.fn(async (_key: string) => structuredClone(this.value));
  readonly set = vi.fn(async (_key: string, value: unknown) => { this.value = structuredClone(value); });
  constructor(value: unknown) { this.value = structuredClone(value); }
}
function setup(value: unknown = fixture()) {
  const storage = new MemoryStorage(value);
  let id = 0;
  return { storage, repository: new LinkShelfRepository(storage, () => NOW, () => `new-${++id}`) };
}
const invalidCases: Array<[string, (database: LinkShelfDatabase) => void, string]> = [
  ['duplicate projects', (d) => d.projects.push({ ...d.projects[0] }), 'DUPLICATE_PROJECTS_ID'],
  ['duplicate sessions', (d) => d.sessions.push({ ...d.sessions[0] }), 'DUPLICATE_SESSIONS_ID'],
  ['duplicate links', (d) => d.links.push({ ...d.links[0] }), 'DUPLICATE_LINKS_ID'],
  ['reserved ID conflict', (d) => { d.projects[0].isInbox = false; }, 'RESERVED_INBOX_ID'],
  ['multiple inboxes', (d) => d.projects.push({ ...d.projects[0], id: 'other-inbox' }), 'INBOX_COUNT'],
  ['orphan session project', (d) => { d.sessions[0].projectId = 'missing'; }, 'SESSION_PROJECT_MISSING'],
  ['orphan link session', (d) => { d.links[0].sessionId = 'missing'; }, 'LINK_SESSION_MISSING'],
  ['orphan link project', (d) => { d.links[0].projectId = 'missing'; }, 'LINK_PROJECT_MISSING'],
  ['session project mismatch', (d) => { d.projects.push({ ...d.projects[0], id: 'other', isInbox: false }); d.links[0].projectId = 'other'; }, 'LINK_PROJECT_MISMATCH'],
];

describe('shared integrity validation and safe initialization', () => {
  // Fixed 2,048-element fixtures exercise invalid-array handling without probing
  // resource exhaustion or making timing/heap assumptions about the machine.
  it.each([1, 2])('rejects a bounded malformed schema-%i backup array without changing a healthy library', async (version) => {
    const { repository, storage } = setup();
    await repository.initialize();
    const before = structuredClone(storage.value);
    storage.set.mockClear();
    const source = version === 1 ? legacy(fixture()) : fixture();
    const malformed = {
      ...backup(), schemaVersion: version,
      database: { ...source, links: Array.from({ length: 2048 }, () => null) },
    };
    expect(() => parseSupportedLinkShelfBackup(malformed)).toThrow();
    await expect(repository.previewImportBackup(malformed, 'replace')).rejects.toBeInstanceOf(StorageValidationError);
    await expect(repository.importBackup(malformed, 'replace', 'unused-invalid-preview')).rejects.toBeInstanceOf(StorageValidationError);
    expect(storage.value).toEqual(before);
    expect(storage.set).not.toHaveBeenCalled();
    expect((await repository.getStorageStatus()).state).toBe('healthy');
    const valid = { ...backup(), schemaVersion: version, database: source };
    const preview = await repository.previewImportBackup(valid, 'replace');
    await repository.importBackup(valid, 'replace', preview.revisionToken);
    expect(await repository.getDatabase()).toEqual(fixture());
  });

  it.each([1, 2])('preserves a bounded malformed schema-%i stored array and recovers only from a confirmed trusted backup', async (version) => {
    const source = version === 1 ? legacy(fixture()) : fixture();
    const malformed = { ...source, links: Array.from({ length: 2048 }, () => null) };
    const { repository, storage } = setup(malformed);
    await expect(repository.initialize()).rejects.toBeInstanceOf(StorageValidationError);
    const status = await repository.getStorageStatus();
    expect(status.state).toBe('recovery');
    expect(status.diagnostics.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(status)).not.toMatch(/private\.example|Private note|Private title/);
    expect(storage.value).toEqual(malformed);
    expect(storage.set).not.toHaveBeenCalled();
    const raw = await repository.exportRecoveryData();
    expect(raw.rawValue).toEqual(malformed);
    const trusted = { ...backup(), schemaVersion: version, database: source };
    const preview = await repository.previewRecoveryBackup(trusted, raw.rawRevisionToken);
    await repository.restoreRecoveryBackup(trusted, raw.rawRevisionToken, preview.revisionToken, true);
    expect(await repository.getDatabase()).toEqual(fixture());
    expect((await repository.getStorageStatus()).state).toBe('healthy');
  });

  it('verifies Chrome JSON readback when optional project and tab fields are omitted', async () => {
    const storage = new MemoryStorage(createEmptyDatabase(NOW));
    storage.set.mockImplementation(async (_key, value) => { storage.value = JSON.parse(JSON.stringify(value)); });
    const repository = new LinkShelfRepository(storage, () => NOW, (() => { let id = 0; return () => `json-${++id}`; })());
    const project = await repository.createProject({ name: 'Chrome serialization' });
    const input = { projectId: project.id, sourceWindowId: 1, tabs: [{ title: 'Synthetic', url: 'https://example.com/json', pinnedBeforeParking: false }] };
    await repository.parkTabs(input);
    // A second write also compares the cached snapshot with Chrome's omitted keys.
    await repository.renameProject(project.id, 'Still healthy');
    expect(await repository.getStorageStatus()).toEqual({ state: 'healthy', diagnostics: [] });
    const exported = await repository.exportBackup();
    expect(JSON.parse(JSON.stringify(exported.database))).toEqual(storage.value);
    expect((await repository.getDatabase()).links).toHaveLength(1);
    expect(Object.hasOwn((storage.value as LinkShelfDatabase).projects[1], 'description')).toBe(false);
  });

  it('normalizes only undefined object properties when comparing storage readback', () => {
    expect(storedValuesEqual({ optional: undefined, nested: { x: 1, optional: undefined } }, { nested: { x: 1 } })).toBe(true);
    expect(storedValuesEqual({ nested: { x: 1 } }, { optional: undefined, nested: { optional: undefined, x: 1 } })).toBe(true);
    expect(storedValuesEqual({ optional: null }, {})).toBe(false);
    expect(storedValuesEqual([undefined], [])).toBe(false);
    expect(storedValuesEqual([null], [undefined])).toBe(false);
    expect(storedValuesEqual(new Array(1), [])).toBe(false);
    expect(storedValuesEqual({ nested: { x: 2 } }, { nested: { x: 1 } })).toBe(false);
  });

  it.each(invalidCases)('rejects %s consistently without persisting or deleting anything', async (_name, change, code) => {
    const value = fixture(); change(value);
    expect(getIntegrityDiagnostics(value).some((item) => item.code === code)).toBe(true);
    expect(LinkShelfDatabaseSchema.safeParse(value).success).toBe(false);
    expect(LinkShelfBackupSchema.safeParse(backup(value)).success).toBe(false);
    const { repository, storage } = setup(value);
    await expect(repository.initialize()).rejects.toBeInstanceOf(StorageIntegrityError);
    const status = await repository.getStorageStatus();
    expect(status.state).toBe('recovery');
    expect(JSON.stringify(status)).not.toMatch(/private\.example|Private note|Private title/);
    await expect(repository.parkTab({ title: 'New', url: 'https://example.com/new', pinnedBeforeParking: false })).rejects.toThrow('recovery');
    expect(storage.value).toEqual(value);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('validates all historical records and preserves legacy Inbox IDs', async () => {
    const value = fixture();
    value.projects[0].id = 'legacy-inbox';
    value.settings.defaultProjectId = 'legacy-inbox';
    value.sessions[0].projectId = 'legacy-inbox';
    value.links.forEach((link) => { link.projectId = 'legacy-inbox'; });
    const { repository, storage } = setup(value);
    expect(await repository.getDatabase()).toEqual(value);
    expect(LinkShelfBackupSchema.safeParse(await repository.exportBackup()).success).toBe(true);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it.each([null, 'malformed', 42, [], { projects: [] }, { ...fixture(), settings: { ...fixture().settings, schemaVersion: 999 } }])('preserves unsupported/malformed stored value %# and exposes a raw copy', async (value) => {
    const { repository, storage } = setup(value);
    await expect(repository.initialize()).rejects.toBeInstanceOf(StorageValidationError);
    const raw = await repository.exportRecoveryData();
    expect(raw).toMatchObject({ format: 'linkshelf-raw-recovery', valuePresent: true, rawValue: value });
    expect(JSON.parse(stringifyRecoveryExport(raw)).rawValue).toEqual(value);
    expect(LinkShelfBackupSchema.safeParse(raw).success).toBe(false);
    expect(storage.value).toEqual(value);
    expect(storage.set).not.toHaveBeenCalled();
    expect((await new LinkShelfRepository(storage).getStorageStatus()).state).toBe('recovery');
  });

  it('creates defaults only for genuinely absent data and verifies the write', async () => {
    const storage = new MemoryStorage(undefined);
    const repository = new LinkShelfRepository(storage, () => NOW);
    expect((await repository.initialize()).settings.schemaVersion).toBe(2);
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(storage.get.mock.invocationCallOrder.at(-1)).toBeGreaterThan(storage.set.mock.invocationCallOrder[0]);
    expect(LinkShelfDatabaseSchema.safeParse(storage.value).success).toBe(true);
  });

  it('does not rewrite valid stored data solely to normalize an existing project name', async () => {
    const value = fixture(); value.projects[0].name = ' Inbox ';
    const { repository, storage } = setup(value);
    expect((await repository.initialize()).projects[0].name).toBe('Inbox');
    expect(storage.value).toEqual(value);
    expect(storage.set).not.toHaveBeenCalled();
    await repository.archiveLink('link-0');
    expect(LinkShelfDatabaseSchema.safeParse(storage.value).success).toBe(true);
  });

  it.each([1, 2])('stages missing Inbox and default repairs before persisting schema %i', async (version) => {
    const value = fixture();
    value.projects[0] = { ...value.projects[0], id: 'existing', isInbox: false };
    value.sessions[0].projectId = 'existing';
    value.links.forEach((link) => { link.projectId = 'existing'; });
    value.settings.defaultProjectId = 'missing';
    const original = version === 1 ? legacy(value) : value;
    const { repository, storage } = setup(original);
    const result = await repository.initialize();
    expect(result.projects.map((project) => project.id)).toEqual(['existing', 'inbox']);
    expect(result.settings.defaultProjectId).toBe('inbox');
    expect(result.links).toEqual(value.links);
    expect(result.sessions).toEqual(value.sessions);
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(LinkShelfDatabaseSchema.safeParse(storage.value).success).toBe(true);
  });

  it('repairs only an invalid default when the Inbox already exists', async () => {
    const value = fixture(); value.settings.defaultProjectId = 'missing';
    expect(LinkShelfDatabaseSchema.safeParse(value).success).toBe(false);
    expect(LinkShelfBackupSchema.safeParse(backup(value)).success).toBe(false);
    const { repository, storage } = setup(value);
    expect((await repository.initialize()).settings.defaultProjectId).toBe('inbox');
    expect((storage.value as LinkShelfDatabase).links).toEqual(value.links);
    expect(storage.set).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2])('does not persist a proposed Inbox repair if schema %i contains an orphan', async (version) => {
    const value = fixture(); value.projects = []; value.links[0].sessionId = 'orphan';
    const original = version === 1 ? legacy(value) : value;
    const { repository, storage } = setup(original);
    expect((await repository.getStorageStatus()).state).toBe('recovery');
    expect(storage.value).toEqual(original);
    expect(storage.set).not.toHaveBeenCalled();
    expect(() => migrateLinkShelfDatabase(original)).toThrow();
  });

  it.each(['before', 'after'] as const)('preserves the original version-1 database if migration write fails %s mutation', async (kind) => {
    const original = legacy(fixture());
    const { repository, storage } = setup(original);
    const write = storage.set.getMockImplementation()!;
    storage.set.mockImplementationOnce(async (key, value) => { if (kind === 'after') await write(key, value); throw new Error('Migration failed'); });
    await expect(repository.initialize()).rejects.toThrow('Migration failed');
    expect(storage.value).toEqual(original);
    expect((await new LinkShelfRepository(storage).initialize()).settings.schemaVersion).toBe(2);
    expect((storage.value as LinkShelfDatabase).links).toEqual(fixture().links);
  });

  it('bounds diagnostics and never embeds stored IDs or notes', () => {
    const value = fixture(1000);
    value.links.forEach((link) => { link.sessionId = 'Private orphan ID'; });
    const issues = getIntegrityDiagnostics(value);
    expect(issues).toHaveLength(100);
    expect(JSON.stringify(issues)).not.toMatch(/Private|private\.example/);
  });

  it.each([100, 1000, 10000])('validates %i links with relationships and history intact', (count) => {
    const value = fixture(count);
    expect(getIntegrityDiagnostics(value)).toEqual([]);
    expect(LinkShelfDatabaseSchema.parse(value).links).toHaveLength(count);
  });
});

describe('verified repository writes, cache and rollback', () => {
  it.each(invalidCases)('rejects proposed %s before any write and retains healthy state', async (_name, change) => {
    const { repository, storage } = setup();
    const before = await repository.getDatabase();
    await expect(repository.updateDatabase((candidate) => { change(candidate); return candidate; })).rejects.toBeInstanceOf(StorageValidationError);
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.value).toEqual(before);
    expect((await repository.getStorageStatus()).state).toBe('healthy');
  });

  it('leaves valid relationships after every supported mutation and backup round trip', async () => {
    const { repository, storage } = setup();
    const valid = () => expect(LinkShelfDatabaseSchema.safeParse(storage.value).success).toBe(true);
    const project = await repository.createProject({ name: 'Project' }); valid();
    await repository.renameProject(project.id, 'Renamed'); valid();
    const parked = await repository.parkTab({ projectId: project.id, title: 'New', url: 'https://example.com/new', pinnedBeforeParking: false }); valid();
    await repository.moveLinkToProject(parked.link.id, 'inbox'); valid();
    await repository.archiveLink(parked.link.id); valid();
    await repository.unarchiveLink(parked.link.id); valid();
    await repository.markReminderGroupNotified(['link-0'], fixture().links[0].reminderAt!); valid();
    await repository.markLinkRestored(parked.link.id); valid();
    const bookmarked = await repository.parkTab({ title: 'Bookmark', url: 'https://example.com/bookmark', pinnedBeforeParking: false });
    await repository.markLinkBookmarked(bookmarked.link.id, 'native-bookmark'); valid();
    const removed = await repository.parkTab({ title: 'Remove', url: 'https://example.com/remove', pinnedBeforeParking: false });
    await repository.removeLink(removed.link.id); valid();
    await repository.updateSettings({ ...(await repository.getSettings()), defaultProjectId: project.id }); valid();
    await repository.deleteProjectAndMoveToInbox(project.id); valid();
    const exported = await repository.exportBackup();
    for (const mode of ['merge', 'replace'] as const) {
      const preview = await repository.previewImportBackup(exported, mode);
      await repository.importBackup(exported, mode, preview.revisionToken); valid();
    }
    expect((await repository.getDatabase()).links.some((link) => link.id === 'link-3' && link.status === 'removed')).toBe(true);
  });

  it.each(['before', 'after', 'quota'] as const)('verifies original state after normal %s write failure and permits retry', async (kind) => {
    const { repository, storage } = setup();
    const before = await repository.getDatabase();
    const write = storage.set.getMockImplementation()!;
    storage.set.mockImplementationOnce(async (key, value) => { if (kind === 'after') await write(key, value); throw new Error(kind === 'quota' ? 'QUOTA_BYTES exceeded' : 'Write failed'); });
    await expect(repository.archiveLink('link-0')).rejects.toThrow(kind === 'quota' ? 'available Chrome storage' : 'Write failed');
    expect(storage.value).toEqual(before);
    expect(await repository.getDatabase()).toEqual(before);
    await repository.archiveLink('link-0');
    expect((await repository.getLink('link-0'))!.status).toBe('archived');
  });

  it('detects silent writes and does not promote an unpersisted candidate into cache', async () => {
    const { repository, storage } = setup();
    const before = await repository.getDatabase();
    storage.set.mockResolvedValueOnce(undefined);
    await expect(repository.archiveLink('link-0')).rejects.toThrow('write was not confirmed');
    expect(await repository.getDatabase()).toEqual(before);
    expect(storage.value).toEqual(before);
  });

  it('preserves unexpected write results instead of overwriting them with a rollback', async () => {
    const { repository, storage } = setup(); await repository.initialize();
    const unexpected = { unexpected: 'Private original data' };
    storage.set.mockImplementationOnce(async () => { storage.value = unexpected; });
    await expect(repository.archiveLink('link-0')).rejects.toThrow('recovery');
    expect(storage.value).toEqual(unexpected);
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect((await repository.getStorageStatus()).state).toBe('recovery');
    await expect(repository.archiveLink('link-0')).rejects.toThrow('recovery');
    expect(storage.value).toEqual(unexpected);
  });

  it('blocks after unreadable write verification, then permits an explicit valid-state recheck', async () => {
    const { repository, storage } = setup(); await repository.initialize();
    const get = storage.get.getMockImplementation()!;
    storage.get.mockImplementationOnce(get).mockRejectedValueOnce(new Error('Readback unavailable'));
    await expect(repository.archiveLink('link-0')).rejects.toThrow('recovery');
    expect((storage.value as LinkShelfDatabase).links[0].status).toBe('archived');
    expect((await repository.getStorageStatus()).state).toBe('recovery');
    await expect(repository.removeLink('link-0')).rejects.toThrow('recovery');
    expect((await repository.getStorageStatus(true)).state).toBe('healthy');
    await repository.unarchiveLink('link-0');
    expect((await repository.getLink('link-0'))!.status).toBe('parked');
  });

  it('blocks if rollback write acknowledges success but readback differs', async () => {
    const { repository, storage } = setup(); await repository.initialize();
    const write = storage.set.getMockImplementation()!;
    storage.set.mockImplementationOnce(async (key, value) => { await write(key, value); throw new Error('Lost acknowledgment'); }).mockResolvedValueOnce(undefined);
    await expect(repository.archiveLink('link-0')).rejects.toThrow('could not verify rollback');
    expect((await repository.getStorageStatus()).state).toBe('recovery');
    expect((storage.value as LinkShelfDatabase).links[0].status).toBe('archived');
  });

  it('rejects stale cached writes and preserves an external change', async () => {
    const { repository, storage } = setup(); await repository.initialize();
    const external = fixture(); external.links[0].note = 'External private note'; storage.value = external;
    await expect(repository.archiveLink('link-0')).rejects.toThrow('recovery');
    expect(storage.value).toEqual(external);
    expect(storage.set).not.toHaveBeenCalled();
    expect((await repository.getStorageStatus(true)).state).toBe('healthy');
    expect((await repository.getLink('link-0'))!.note).toBe('External private note');
  });

  it('retains the operation snapshot when a change event invalidates the cache during an async mutation', async () => {
    const { repository, storage } = setup(); await repository.initialize();
    await repository.updateDatabase(async (database) => {
      repository.invalidateCache();
      database.links[0].note = 'Updated note';
      return database;
    });
    expect((storage.value as LinkShelfDatabase).links[0].note).toBe('Updated note');
    expect((await repository.getStorageStatus()).state).toBe('healthy');
  });

  it('preserves raw export presence when the storage key is absent', async () => {
    const storage = new MemoryStorage(undefined);
    const repository = new LinkShelfRepository(storage, () => NOW);
    const exported = await repository.exportRecoveryData();
    expect(exported).toMatchObject({ valuePresent: false, rawValue: null });
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.value).toBeUndefined();
  });

  it('detects invalid storage after explicit cache invalidation and worker restart', async () => {
    const { repository, storage } = setup(); await repository.initialize();
    const value = fixture(); value.links[0].sessionId = 'missing'; storage.value = value;
    repository.invalidateCache();
    expect((await repository.getStorageStatus()).state).toBe('recovery');
    expect((await new LinkShelfRepository(storage).getStorageStatus()).state).toBe('recovery');
    expect(storage.value).toEqual(value);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('does not initialize empty defaults when storage is unreadable', async () => {
    const { repository, storage } = setup(); const before = structuredClone(storage.value);
    storage.get.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect((await repository.getStorageStatus()).state).toBe('recovery');
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.value).toEqual(before);
    expect((await repository.getStorageStatus(true)).state).toBe('healthy');
  });
});

describe('explicit recovery from independently validated backups', () => {
  async function recoverable() {
    const raw = fixture(); raw.links[0].sessionId = 'orphan';
    const f = setup(raw);
    expect((await f.repository.getStorageStatus()).state).toBe('recovery');
    const exported = await f.repository.exportRecoveryData();
    return { ...f, raw, exported };
  }
  it.each([1, 2])('restores a supported version-%i backup only after export, preview and confirmation', async (version) => {
    const f = await recoverable();
    const source = version === 1 ? { ...backup(), schemaVersion: 1, database: legacy(fixture()) } : backup();
    expect(parseSupportedLinkShelfBackup(source).schemaVersion).toBe(2);
    const preview = await f.repository.previewRecoveryBackup(source, f.exported.rawRevisionToken);
    expect(f.storage.value).toEqual(f.raw);
    expect(f.storage.set).not.toHaveBeenCalled();
    await f.repository.restoreRecoveryBackup(source, f.exported.rawRevisionToken, preview.revisionToken, true);
    expect((await f.repository.getStorageStatus()).state).toBe('healthy');
    expect(await f.repository.getDatabase()).toEqual(fixture());
    expect((await new LinkShelfRepository(f.storage).getDatabase()).links).toEqual(fixture().links);
    expect(f.exported.rawValue).toEqual(f.raw);
  });

  it('supports raw preservation of structural corruption without speculative repair', async () => {
    const raw = { incomplete: [{ note: 'Private unrecoverable record' }] };
    const { repository, storage } = setup(raw);
    await repository.getStorageStatus();
    const exported = await repository.exportRecoveryData();
    expect(exported.rawValue).toEqual(raw);
    const preview = await repository.previewRecoveryBackup(backup(), exported.rawRevisionToken);
    await repository.restoreRecoveryBackup(backup(), exported.rawRevisionToken, preview.revisionToken, true);
    expect(LinkShelfDatabaseSchema.safeParse(storage.value).success).toBe(true);
    expect(exported.rawValue).toEqual(raw);
  });

  it('leaves raw data unchanged when preview is canceled or explicit confirmation is missing', async () => {
    const f = await recoverable();
    const preview = await f.repository.previewRecoveryBackup(backup(), f.exported.rawRevisionToken);
    await expect(f.repository.restoreRecoveryBackup(backup(), f.exported.rawRevisionToken, preview.revisionToken, false)).rejects.toThrow('confirm');
    expect(f.storage.set).not.toHaveBeenCalled();
    expect(f.storage.value).toEqual(f.raw);
  });

  it('rejects invalid backups and raw recovery files without changing corrupted storage', async () => {
    const f = await recoverable();
    for (const source of [backup(f.raw), f.exported, {}, { ...backup(), schemaVersion: 999 }]) {
      await expect(f.repository.previewRecoveryBackup(source, f.exported.rawRevisionToken)).rejects.toThrow('not a valid LinkShelf backup');
    }
    expect(f.storage.value).toEqual(f.raw);
    expect(f.storage.set).not.toHaveBeenCalled();
  });

  it('binds recovery confirmation to both the selected backup and exported original', async () => {
    const f = await recoverable();
    const preview = await f.repository.previewRecoveryBackup(backup(), f.exported.rawRevisionToken);
    const changed = backup(); changed.database.links[0].note = 'Different backup';
    await expect(f.repository.restoreRecoveryBackup(changed, f.exported.rawRevisionToken, preview.revisionToken, true)).rejects.toThrow('preview changed');
    const altered = structuredClone(f.raw); altered.links[0].note = 'New original note'; f.storage.value = altered;
    await expect(f.repository.restoreRecoveryBackup(backup(), f.exported.rawRevisionToken, preview.revisionToken, true)).rejects.toThrow('changed after raw export');
    expect(f.storage.value).toEqual(altered);
    expect(f.storage.set).not.toHaveBeenCalled();
  });

  it('does not permit recovery replacement on a healthy database', async () => {
    const { repository, storage } = setup(); await repository.initialize();
    const raw = await repository.exportRecoveryData();
    await expect(repository.previewRecoveryBackup(backup(), raw.rawRevisionToken)).rejects.toThrow('only while');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it.each(['before', 'after', 'quota'] as const)('restores exact corrupted original after a failed recovery write (%s)', async (kind) => {
    const f = await recoverable();
    const preview = await f.repository.previewRecoveryBackup(backup(), f.exported.rawRevisionToken);
    const write = f.storage.set.getMockImplementation()!;
    f.storage.set.mockImplementationOnce(async (key, value) => { if (kind === 'after') await write(key, value); throw new Error(kind === 'quota' ? 'Quota exceeded' : 'Recovery write failed'); });
    await expect(f.repository.restoreRecoveryBackup(backup(), f.exported.rawRevisionToken, preview.revisionToken, true)).rejects.toThrow(kind === 'quota' ? 'available Chrome storage' : 'Recovery write failed');
    expect(f.storage.value).toEqual(f.raw);
    expect((await f.repository.getStorageStatus()).state).toBe('recovery');
    await f.repository.restoreRecoveryBackup(backup(), f.exported.rawRevisionToken, preview.revisionToken, true);
    expect((await f.repository.getStorageStatus()).state).toBe('healthy');
  });

  it('reports failed recovery rollback honestly and blocks other writes', async () => {
    const f = await recoverable();
    const preview = await f.repository.previewRecoveryBackup(backup(), f.exported.rawRevisionToken);
    const write = f.storage.set.getMockImplementation()!;
    f.storage.set.mockImplementationOnce(async (key, value) => { await write(key, value); throw new Error('Write acknowledgment failed'); }).mockRejectedValueOnce(new Error('Rollback failed'));
    await expect(f.repository.restoreRecoveryBackup(backup(), f.exported.rawRevisionToken, preview.revisionToken, true)).rejects.toThrow('could not verify rollback');
    expect((await f.repository.getStorageStatus()).state).toBe('recovery');
    await expect(f.repository.parkTab({ title: 'No new writes', url: 'https://example.com', pinnedBeforeParking: false })).rejects.toThrow('recovery');
    expect((await f.repository.exportRecoveryData()).rawValue).toEqual(f.storage.value);
    expect(f.exported.rawValue).toEqual(f.raw);
  });

  it('rejects oversized raw exports without altering stored information', async () => {
    const raw = { huge: 'x'.repeat(32 * 1024 * 1024) };
    const { repository, storage } = setup(raw);
    await repository.getStorageStatus();
    await expect(repository.exportRecoveryData()).rejects.toThrow('32 MiB');
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.value).toEqual(raw);
  });

  it('compares readback without equating missing values with null or different array contents', () => {
    expect(storedValuesEqual(undefined, null)).toBe(false);
    expect(storedValuesEqual([1], [2])).toBe(false);
    expect(storedValuesEqual({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(storedValuesEqual([1], { 0: 1 })).toBe(false);
    expect(DATABASE_STORAGE_KEY).toBe('linkshelfDatabase');
  });
});
