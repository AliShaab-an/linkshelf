import { describe, expect, it } from 'vitest';
import { createEmptyDatabase, INBOX_PROJECT_ID } from '@/domain/defaults';
import { MAX_BACKUP_BYTES } from '@/domain/constants';
import type { StorageAdapter } from './storage-adapter';
import {
  DATABASE_STORAGE_KEY,
  DuplicateProjectNameError,
  InvalidProjectNameError,
  LinkShelfRepository,
  ProtectedInboxError,
  InvalidLinkStateError,
  StorageIntegrityError,
  StorageValidationError,
} from './repository';

const now = '2026-08-09T12:00:00.000Z';

class MemoryStorageAdapter implements StorageAdapter {
  readonly values = new Map<string, unknown>();
  writeCount = 0;
  failOnWrite?: number;

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.writeCount += 1;
    if (this.writeCount === this.failOnWrite) {
      throw new Error('simulated write failure');
    }
    this.values.set(key, structuredClone(value));
  }
}

function createRepository(storage: StorageAdapter) {
  return new LinkShelfRepository(storage, () => now);
}

describe('LinkShelfRepository', () => {
  it('creates and persists a new database when storage is empty', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);

    const database = await repository.initialize();

    expect(database.projects).toHaveLength(1);
    expect(database.projects[0]).toMatchObject({
      id: INBOX_PROJECT_ID,
      isInbox: true,
    });
    expect(storage.values.get(DATABASE_STORAGE_KEY)).toEqual(database);
    expect(storage.writeCount).toBe(1);
  });

  it('does not create another Inbox when initialized repeatedly', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);

    await repository.initialize();
    const database = await repository.initialize();

    expect(database.projects.filter((project) => project.isInbox)).toHaveLength(1);
    expect(storage.writeCount).toBe(1);
  });

  it('updates user preferences without replacing protected settings', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    const current = await repository.getSettings();

    const updated = await repository.updateSettings({
      defaultProjectId: current.defaultProjectId,
      includePinnedTabsByDefault: true,
      confirmBeforeBulkClose: false,
      notificationsEnabled: false,
      defaultRestoreBehavior: 'open-copy',
      displayDensity: 'compact',
      defaultRestoreMode: 'unloaded',
    });

    expect(updated).toMatchObject({
      schemaVersion: 2,
      includePinnedTabsByDefault: true,
      confirmBeforeBulkClose: false,
      notificationsEnabled: false,
      defaultRestoreBehavior: 'open-copy',
      displayDensity: 'compact',
      defaultRestoreMode: 'unloaded',
    });
    expect(updated.trackingParamsToRemove).toEqual(current.trackingParamsToRemove);
  });

  it('exports a validated, timestamped copy of all local data', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    await repository.initialize();

    const backup = await repository.exportBackup();

    expect(backup).toMatchObject({
      format: 'linkshelf-backup',
      schemaVersion: 2,
      exportedAt: now,
    });
    expect(backup.database.projects[0].isInbox).toBe(true);
  });

  it('migrates and persists an existing version 1 database during initialization', async () => {
    const storage = new MemoryStorageAdapter();
    const database = createEmptyDatabase(now);
    const { displayDensity: _density, defaultRestoreMode: _mode, ...versionOneSettings } = database.settings;
    await storage.set(DATABASE_STORAGE_KEY, {
      ...database,
      settings: { ...versionOneSettings, schemaVersion: 1 },
    });
    const writesBeforeMigration = storage.writeCount;

    const migrated = await createRepository(storage).initialize();

    expect(migrated.settings).toMatchObject({
      schemaVersion: 2,
      displayDensity: 'comfortable',
      defaultRestoreMode: 'normal',
    });
    expect(storage.writeCount - writesBeforeMigration).toBe(1);
    expect(storage.values.get(DATABASE_STORAGE_KEY)).toEqual(migrated);
  });

  it('merges new backup records without overwriting current records', async () => {
    const targetStorage = new MemoryStorageAdapter();
    const target = new LinkShelfRepository(targetStorage, () => now, () => 'unused');
    await target.initialize();

    const sourceStorage = new MemoryStorageAdapter();
    const sourceIds = ['project-imported', 'session-imported', 'link-imported'];
    const source = new LinkShelfRepository(sourceStorage, () => now, () => sourceIds.shift()!);
    const project = await source.createProject({ name: 'Imported project' });
    await source.parkTab({
      projectId: project.id,
      title: 'Imported link',
      url: 'https://example.com/imported',
      pinnedBeforeParking: false,
    });

    const backup = await source.exportBackup();
    const preview = await target.previewImportBackup(backup, 'merge');
    const result = await target.importBackup(backup, 'merge', preview.revisionToken);
    const database = await target.getDatabase();

    expect(result).toEqual({
      mode: 'merge', projectsAdded: 1, sessionsAdded: 1, linksAdded: 1, recordsSkipped: 1,
    });
    expect(database.projects.filter((item) => item.isInbox)).toHaveLength(1);
    expect(database.links[0].title).toBe('Imported link');
    expect(preview).toMatchObject({
      mode: 'merge',
      projectsAdded: 1,
      sessionsAdded: 1,
      linksAdded: 1,
      recordsSkipped: 1,
      conflicts: 0,
      settingsAction: 'keep-current',
      source: { projects: 2, sessions: 1, links: 1 },
    });
  });

  it('rejects invalid imports before changing storage', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    const before = await repository.getDatabase();

    const writesBefore = storage.writeCount;
    await expect(repository.previewImportBackup({ format: 'not-linkshelf' }, 'replace'))
      .rejects.toBeInstanceOf(StorageValidationError);

    expect(await repository.getDatabase()).toEqual(before);
    expect(storage.writeCount).toBe(writesBefore);
  });

  it('rejects oversized backups before changing storage', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    const backup = await repository.exportBackup();
    backup.database.projects[0].description = 'x'.repeat(MAX_BACKUP_BYTES);
    const writesBefore = storage.writeCount;

    await expect(repository.previewImportBackup(backup, 'replace'))
      .rejects.toThrow('32 MiB');

    expect(storage.writeCount).toBe(writesBefore);
  });

  it('restores the previous database when an import write fails', async () => {
    const targetStorage = new MemoryStorageAdapter();
    const targetIds = ['session-current', 'link-current'];
    const target = new LinkShelfRepository(targetStorage, () => now, () => targetIds.shift()!);
    await target.parkTab({ title: 'Current link', url: 'https://current.example.com', pinnedBeforeParking: false });
    const before = await target.getDatabase();

    const sourceStorage = new MemoryStorageAdapter();
    const sourceIds = ['session-new', 'link-new'];
    const source = new LinkShelfRepository(sourceStorage, () => now, () => sourceIds.shift()!);
    await source.parkTab({ title: 'Replacement link', url: 'https://replacement.example.com', pinnedBeforeParking: false });

    const backup = await source.exportBackup();
    const preview = await target.previewImportBackup(backup, 'replace');
    targetStorage.failOnWrite = targetStorage.writeCount + 1;
    await expect(target.importBackup(backup, 'replace', preview.revisionToken)).rejects.toThrow('simulated write failure');
    expect(await target.getDatabase()).toEqual(before);
  });

  it('previews the exact records replaced without writing', async () => {
    const targetStorage = new MemoryStorageAdapter();
    const target = createRepository(targetStorage);
    await target.parkTab({ title: 'Current', url: 'https://current.example.com', pinnedBeforeParking: false });
    const writesBefore = targetStorage.writeCount;

    const sourceStorage = new MemoryStorageAdapter();
    const source = createRepository(sourceStorage);
    const backup = await source.exportBackup();
    const preview = await target.previewImportBackup(backup, 'replace');

    expect(preview).toMatchObject({
      mode: 'replace',
      current: { projects: 1, sessions: 1, links: 1 },
      source: { projects: 1, sessions: 0, links: 0 },
      projectsAdded: 1,
      sessionsAdded: 0,
      linksAdded: 0,
      settingsAction: 'use-backup',
    });
    expect(targetStorage.writeCount).toBe(writesBefore);
  });

  it('rejects a stale import preview without replacing newer data', async () => {
    const targetStorage = new MemoryStorageAdapter();
    const ids = ['new-project'];
    const target = new LinkShelfRepository(targetStorage, () => now, () => ids.shift()!);
    const source = createRepository(new MemoryStorageAdapter());
    const backup = await source.exportBackup();
    const preview = await target.previewImportBackup(backup, 'replace');
    await target.createProject({ name: 'Created after preview' });
    const writesBeforeImport = targetStorage.writeCount;

    await expect(
      target.importBackup(backup, 'replace', preview.revisionToken),
    ).rejects.toThrow('data changed');

    expect((await target.getProjects()).some((project) => project.name === 'Created after preview')).toBe(true);
    expect(targetStorage.writeCount).toBe(writesBeforeImport);
  });

  it('reports relationship conflicts and refuses to merge them', async () => {
    const targetStorage = new MemoryStorageAdapter();
    const targetIds = ['project-current', 'session-shared', 'link-current'];
    const target = new LinkShelfRepository(targetStorage, () => now, () => targetIds.shift()!);
    const targetProject = await target.createProject({ name: 'Current project' });
    await target.parkTab({
      projectId: targetProject.id,
      title: 'Current',
      url: 'https://current.example.com',
      pinnedBeforeParking: false,
    });

    const sourceStorage = new MemoryStorageAdapter();
    const sourceIds = ['project-imported', 'session-shared', 'link-imported'];
    const source = new LinkShelfRepository(sourceStorage, () => now, () => sourceIds.shift()!);
    const sourceProject = await source.createProject({ name: 'Imported project' });
    await source.parkTab({
      projectId: sourceProject.id,
      title: 'Imported',
      url: 'https://imported.example.com',
      pinnedBeforeParking: false,
    });

    const backup = await source.exportBackup();
    const preview = await target.previewImportBackup(backup, 'merge');
    const writesBeforeImport = targetStorage.writeCount;

    expect(preview.conflicts).toBe(2);
    await expect(target.importBackup(backup, 'merge', preview.revisionToken))
      .rejects.toThrow('conflicts');
    expect(targetStorage.writeCount).toBe(writesBeforeImport);
  });

  it('repairs valid stored data that has no Inbox', async () => {
    const storage = new MemoryStorageAdapter();
    const database = createEmptyDatabase(now);
    database.projects = [
      {
        id: 'project-1',
        name: 'Existing project',
        isInbox: false,
        createdAt: now,
        updatedAt: now,
      },
    ];
    database.settings.defaultProjectId = 'project-1';
    storage.values.set(DATABASE_STORAGE_KEY, database);

    const repaired = await createRepository(storage).initialize();

    expect(repaired.projects).toHaveLength(2);
    expect(repaired.projects.some((project) => project.isInbox)).toBe(true);
    expect(repaired.settings.defaultProjectId).toBe(INBOX_PROJECT_ID);
  });

  it('rejects invalid stored data without overwriting it', async () => {
    const storage = new MemoryStorageAdapter();
    const invalidData = { projects: 'not-an-array' };
    storage.values.set(DATABASE_STORAGE_KEY, invalidData);

    await expect(createRepository(storage).initialize()).rejects.toBeInstanceOf(
      StorageValidationError,
    );
    expect(storage.values.get(DATABASE_STORAGE_KEY)).toEqual(invalidData);
    expect(storage.writeCount).toBe(0);
  });

  it('rejects multiple Inbox projects instead of deleting user data', async () => {
    const storage = new MemoryStorageAdapter();
    const database = createEmptyDatabase(now);
    database.projects.push({
      id: 'second-inbox',
      name: 'Another Inbox',
      isInbox: true,
      createdAt: now,
      updatedAt: now,
    });
    storage.values.set(DATABASE_STORAGE_KEY, database);

    await expect(createRepository(storage).initialize()).rejects.toBeInstanceOf(
      StorageIntegrityError,
    );
    expect(storage.writeCount).toBe(0);
  });

  it('validates database updates before writing them', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    await repository.initialize();

    await expect(
      repository.updateDatabase((database) => ({
        ...database,
        projects: database.projects.map((project) =>
          project.isInbox ? { ...project, name: '   ' } : project,
        ),
      })),
    ).rejects.toBeInstanceOf(StorageValidationError);

    expect(storage.writeCount).toBe(1);
  });

  it('parks a tab by creating one session and one normalized link', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1'];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );

    const result = await repository.parkTab({
      title: 'React documentation',
      url: 'https://React.dev/learn/?utm_source=email#start',
      faviconUrl: 'https://react.dev/favicon.ico',
      note: '  Read the hooks section  ',
      reminderAt: '2026-08-11T09:30:00.000Z',
      sourceWindowId: 7,
      pinnedBeforeParking: false,
      originalIndex: 3,
    });
    const database = await repository.getDatabase();

    expect(result.session).toMatchObject({
      id: 'session-1',
      projectId: INBOX_PROJECT_ID,
      sourceWindowId: 7,
      note: 'Read the hooks section',
      reminderAt: '2026-08-11T09:30:00.000Z',
      createdAt: now,
    });
    expect(result.link).toMatchObject({
      id: 'link-1',
      sessionId: 'session-1',
      projectId: INBOX_PROJECT_ID,
      normalizedUrl: 'https://react.dev/learn',
      domain: 'react.dev',
      status: 'parked',
      note: 'Read the hooks section',
      reminderAt: '2026-08-11T09:30:00.000Z',
      originalIndex: 3,
    });
    expect(database.sessions).toEqual([result.session]);
    expect(database.links).toEqual([result.link]);
  });

  it('parks multiple tabs in one session and one storage update', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1', 'link-2'];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );
    await repository.initialize();
    const writesBeforeParking = storage.writeCount;

    const result = await repository.parkTabs({
      projectId: INBOX_PROJECT_ID,
      note: '  Shared research  ',
      reminderAt: '2026-08-11T09:00:00.000Z',
      sourceWindowId: 5,
      tabs: [
        {
          title: 'First',
          url: 'https://first.example.com/?utm_source=test',
          pinnedBeforeParking: false,
          originalIndex: 1,
        },
        {
          title: 'Second',
          url: 'https://second.example.com/docs',
          pinnedBeforeParking: false,
          originalIndex: 2,
        },
      ],
    });

    expect(storage.writeCount - writesBeforeParking).toBe(1);
    expect(result.session).toMatchObject({
      id: 'session-1',
      note: 'Shared research',
      reminderAt: '2026-08-11T09:00:00.000Z',
      sourceWindowId: 5,
    });
    expect(result.links).toHaveLength(2);
    expect(result.links.map((link) => link.sessionId)).toEqual([
      'session-1',
      'session-1',
    ]);
    expect(result.links.map((link) => link.note)).toEqual([
      'Shared research',
      'Shared research',
    ]);

    const groups = await repository.getParkedSessionGroups(INBOX_PROJECT_ID);

    expect(groups).toHaveLength(1);
    expect(groups[0].session.id).toBe('session-1');
    expect(groups[0].links.map((link) => link.id)).toEqual([
      'link-1',
      'link-2',
    ]);

    const notifiedLinks = await repository.markSessionRemindersNotified(
      result.session.id,
    );

    expect(notifiedLinks).toHaveLength(2);
    expect(
      notifiedLinks.every((link) => link.reminderNotifiedAt === now),
    ).toBe(true);
  });

  it('does not write a parked tab into a missing project', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    await repository.initialize();

    await expect(
      repository.parkTab({
        projectId: 'missing-project',
        title: 'Example',
        url: 'https://example.com',
        pinnedBeforeParking: false,
      }),
    ).rejects.toBeInstanceOf(StorageIntegrityError);

    const database = await repository.getDatabase();
    expect(database.sessions).toEqual([]);
    expect(database.links).toEqual([]);
  });

  it('returns parked links newest first', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1', 'session-2', 'link-2'];
    let currentTime = '2026-08-10T10:00:00.000Z';
    const repository = new LinkShelfRepository(
      storage,
      () => currentTime,
      () => ids.shift()!,
    );

    await repository.parkTab({
      title: 'First',
      url: 'https://first.example.com',
      pinnedBeforeParking: false,
    });
    currentTime = '2026-08-10T11:00:00.000Z';
    await repository.parkTab({
      title: 'Second',
      url: 'https://second.example.com',
      pinnedBeforeParking: false,
    });

    const links = await repository.getParkedLinks();

    expect(links.map((link) => link.title)).toEqual(['Second', 'First']);
  });

  it('returns due reminders and records a notification idempotently', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1', 'session-2', 'link-2'];
    let currentTime = '2026-08-10T10:00:00.000Z';
    const repository = new LinkShelfRepository(
      storage,
      () => currentTime,
      () => ids.shift()!,
    );

    await repository.parkTab({
      title: 'Due link',
      url: 'https://due.example.com',
      reminderAt: '2026-08-10T09:00:00.000Z',
      pinnedBeforeParking: false,
    });
    await repository.parkTab({
      title: 'Future link',
      url: 'https://future.example.com',
      reminderAt: '2026-08-11T09:00:00.000Z',
      pinnedBeforeParking: false,
    });

    expect((await repository.getDueReminderLinks()).map((link) => link.id)).toEqual([
      'link-1',
    ]);

    currentTime = '2026-08-10T10:05:00.000Z';
    const firstUpdate = await repository.markReminderNotified('link-1');
    currentTime = '2026-08-10T10:10:00.000Z';
    const secondUpdate = await repository.markReminderNotified('link-1');

    expect(firstUpdate.reminderNotifiedAt).toBe('2026-08-10T10:05:00.000Z');
    expect(secondUpdate.reminderNotifiedAt).toBe(
      '2026-08-10T10:05:00.000Z',
    );
  });

  it('marks a parked link as restored with a timestamp', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1'];
    let currentTime = now;
    const repository = new LinkShelfRepository(
      storage,
      () => currentTime,
      () => ids.shift()!,
    );
    await repository.parkTab({
      title: 'Example',
      url: 'https://example.com',
      pinnedBeforeParking: false,
    });
    currentTime = '2026-08-10T13:00:00.000Z';

    const restored = await repository.markLinkRestored('link-1');

    expect(restored).toMatchObject({
      id: 'link-1',
      status: 'restored',
      restoredAt: currentTime,
      updatedAt: currentTime,
    });
    expect(await repository.getParkedLinks()).toEqual([]);
  });

  it('refuses to restore the same link twice', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1'];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );
    await repository.parkTab({
      title: 'Example',
      url: 'https://example.com',
      pinnedBeforeParking: false,
    });
    await repository.markLinkRestored('link-1');

    await expect(repository.markLinkRestored('link-1')).rejects.toBeInstanceOf(
      InvalidLinkStateError,
    );
  });

  it('archives, unarchives, and safely removes a link without deleting its record', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1'];
    let currentTime = now;
    const repository = new LinkShelfRepository(
      storage,
      () => currentTime,
      () => ids.shift()!,
    );
    await repository.parkTab({
      title: 'Lifecycle example',
      url: 'https://example.com/lifecycle',
      reminderAt: '2026-08-12T09:00:00.000Z',
      pinnedBeforeParking: false,
    });

    currentTime = '2026-08-10T13:00:00.000Z';
    const archived = await repository.archiveLink('link-1');
    expect(archived).toMatchObject({
      status: 'archived',
      archivedAt: currentTime,
      updatedAt: currentTime,
    });
    expect(await repository.getParkedLinks()).toEqual([]);
    expect((await repository.getArchivedLinks())[0].id).toBe('link-1');

    currentTime = '2026-08-10T14:00:00.000Z';
    const unarchived = await repository.unarchiveLink('link-1');
    expect(unarchived.status).toBe('parked');
    expect(unarchived.archivedAt).toBeUndefined();

    currentTime = '2026-08-10T15:00:00.000Z';
    const removed = await repository.removeLink('link-1');
    expect(removed).toMatchObject({
      status: 'removed',
      removedAt: currentTime,
    });
    expect(await repository.getParkedLinks()).toEqual([]);
    expect(await repository.getArchivedLinks()).toEqual([]);
    expect((await repository.getDatabase()).links[0].status).toBe('removed');
  });

  it('rejects invalid lifecycle transitions', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1'];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );
    await repository.parkTab({
      title: 'Example',
      url: 'https://example.com',
      pinnedBeforeParking: false,
    });

    await expect(repository.unarchiveLink('link-1')).rejects.toBeInstanceOf(
      InvalidLinkStateError,
    );
    await repository.archiveLink('link-1');
    await expect(repository.archiveLink('link-1')).rejects.toBeInstanceOf(
      InvalidLinkStateError,
    );
  });

  it('keeps bookmark history while removing a converted link from active results', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['session-1', 'link-1'];
    let currentTime = now;
    const repository = new LinkShelfRepository(
      storage,
      () => currentTime,
      () => ids.shift()!,
    );
    await repository.parkTab({
      title: 'Permanent reference',
      url: 'https://example.com/reference',
      pinnedBeforeParking: false,
    });

    currentTime = '2026-08-10T16:00:00.000Z';
    const converted = await repository.markLinkBookmarked('link-1', 'bookmark-7');

    expect(converted).toMatchObject({
      status: 'removed',
      bookmarkId: 'bookmark-7',
      bookmarkedAt: currentTime,
      removedAt: currentTime,
    });
    expect(await repository.searchLinks('Permanent')).toEqual([]);
    expect((await repository.getDatabase()).links[0]).toMatchObject({
      id: 'link-1',
      bookmarkId: 'bookmark-7',
    });
  });

  it('moves one parked link into a new session without changing its original session', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['project-1', 'session-1', 'link-1', 'link-2', 'session-moved'];
    const repository = new LinkShelfRepository(storage, () => now, () => ids.shift()!);
    const project = await repository.createProject({ name: 'Destination' });
    const parked = await repository.parkTabs({
      tabs: [
        { title: 'First', url: 'https://example.com/first', pinnedBeforeParking: false },
        { title: 'Second', url: 'https://example.com/second', pinnedBeforeParking: false },
      ],
    });

    const moved = await repository.moveLinkToProject(parked.links[0].id, project.id);
    const database = await repository.getDatabase();

    expect(moved).toMatchObject({ projectId: project.id, sessionId: 'session-moved' });
    expect(database.sessions.find((session) => session.id === 'session-1')?.projectId).toBe(INBOX_PROJECT_ID);
    expect(database.links.find((link) => link.id === 'link-2')?.sessionId).toBe('session-1');
  });

  it('searches active and archived links by text, note, URL, and project', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = [
      'project-1',
      'session-1',
      'link-1',
      'session-2',
      'link-2',
      'session-3',
      'link-3',
    ];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );
    const project = await repository.createProject({ name: 'Client Portal' });
    await repository.parkTab({
      projectId: project.id,
      title: 'React Authentication Guide',
      url: 'https://docs.example.com/authentication',
      note: 'Review before launch',
      pinnedBeforeParking: false,
    });
    await repository.parkTab({
      title: 'Archived CSS reference',
      url: 'https://css.example.com/grid',
      pinnedBeforeParking: false,
    });
    const restored = await repository.parkTab({
      title: 'Restored secret result',
      url: 'https://hidden.example.com',
      pinnedBeforeParking: false,
    });
    await repository.archiveLink('link-2');
    await repository.markLinkRestored(restored.link.id);

    expect((await repository.searchLinks('react launch')).map((result) => result.link.id)).toEqual(['link-1']);
    expect((await repository.searchLinks('CLIENT portal')).map((result) => result.link.id)).toEqual(['link-1']);
    expect((await repository.searchLinks('css.example.com')).map((result) => result.link.id)).toEqual(['link-2']);
    expect(await repository.searchLinks('secret')).toEqual([]);
    expect(await repository.searchLinks('   ')).toEqual([]);
  });

  it('preserves legacy search results and ties across statuses, fields, and duplicate URLs', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    const project = await repository.createProject({ name: 'Étude Portal' });
    const link = (await repository.parkTab({
      projectId: project.id, title: 'Résumé C++', url: 'https://example.test/ref?q=blue',
      note: 'Review launch', pinnedBeforeParking: false,
    })).link;
    const original = structuredClone(await repository.getDatabase());
    original.links = (['parked', 'archived', 'archived', 'restored', 'removed'] as const).map((status, i) => ({
      ...link, id: `search-${i}`, status, updatedAt: i === 2 ? '2099-01-01T00:00:00.000Z' : link.updatedAt,
    }));
    await storage.set(DATABASE_STORAGE_KEY, original);
    repository.invalidateCache();
    for (const query of [link.url, 'ref?q=', 'example.test', 'RÉSUMÉ', 'launch', 'étude portal', '  c++\tReview  ', ' ', 'absent']) {
      const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const expected = tokens.length ? original.links
        .filter(record => record.status === 'parked' || record.status === 'archived')
        .map(record => ({ link: record, projectName: project.name }))
        .filter(({ link, projectName }) => tokens.every(token =>
          [link.title, link.url, link.domain, link.note ?? '', projectName].join('\n').toLocaleLowerCase().includes(token)))
        .sort((a, b) => b.link.updatedAt.localeCompare(a.link.updatedAt)) : [];
      expect(await repository.searchLinks(query)).toEqual(expected);
    }
    expect((await repository.searchLinks('portal')).map(result => result.link.id)).toEqual(['search-2', 'search-0', 'search-1']);
  });

  it('finds the expected match in a 5,000-link library', async () => {
    const storage = new MemoryStorageAdapter();
    const database = createEmptyDatabase(now);
    database.sessions.push({
      id: 'scale-session',
      projectId: INBOX_PROJECT_ID,
      createdAt: now,
      updatedAt: now,
    });
    database.links = Array.from({ length: 5_000 }, (_, index) => ({
      id: `scale-link-${index}`,
      sessionId: 'scale-session',
      projectId: INBOX_PROJECT_ID,
      title: index === 4_321 ? 'Unique performance needle' : `Reference ${index}`,
      url: `https://example.com/reference/${index}`,
      normalizedUrl: `https://example.com/reference/${index}`,
      domain: 'example.com',
      status: 'parked' as const,
      pinnedBeforeParking: false,
      createdAt: now,
      updatedAt: now,
    }));
    await storage.set(DATABASE_STORAGE_KEY, database);
    const repository = createRepository(storage);
    await repository.initialize();

    const results = await repository.searchLinks('performance needle');

    expect(results.map((result) => result.link.id)).toEqual(['scale-link-4321']);
  });

  it('creates a trimmed project and lists Inbox first', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => 'project-client',
    );

    const project = await repository.createProject({
      name: '  Client Website  ',
    });
    const projects = await repository.getProjects();

    expect(project).toMatchObject({
      id: 'project-client',
      name: 'Client Website',
      isInbox: false,
      createdAt: now,
    });
    expect(projects.map((item) => item.name)).toEqual(['Inbox', 'Client Website']);
  });

  it('rejects blank project names without changing storage', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    await repository.initialize();
    const writesBeforeCreation = storage.writeCount;

    await expect(repository.createProject({ name: '   ' })).rejects.toBeInstanceOf(
      InvalidProjectNameError,
    );
    expect(storage.writeCount).toBe(writesBeforeCreation);
  });

  it('rejects duplicate project names case-insensitively', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['project-1', 'project-2'];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );
    await repository.createProject({ name: 'Client Website' });
    const writesBeforeDuplicate = storage.writeCount;

    await expect(
      repository.createProject({ name: 'client website' }),
    ).rejects.toBeInstanceOf(DuplicateProjectNameError);
    expect(storage.writeCount).toBe(writesBeforeDuplicate);
  });

  it('filters parked links by project', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['project-1', 'session-1', 'link-1', 'session-2', 'link-2'];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );
    const project = await repository.createProject({ name: 'Client Website' });
    await repository.parkTab({
      title: 'Inbox link',
      url: 'https://inbox.example.com',
      pinnedBeforeParking: false,
    });
    await repository.parkTab({
      projectId: project.id,
      title: 'Client link',
      url: 'https://client.example.com',
      pinnedBeforeParking: false,
    });

    const projectLinks = await repository.getParkedLinks(project.id);

    expect(projectLinks.map((link) => link.title)).toEqual(['Client link']);
  });

  it('renames a project with a trimmed unique name', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => 'project-1',
    );
    const project = await repository.createProject({ name: 'Old Name' });

    const renamed = await repository.renameProject(
      project.id,
      '  New Name  ',
    );

    expect(renamed).toMatchObject({
      id: project.id,
      name: 'New Name',
      updatedAt: now,
    });
    expect((await repository.getProjects()).map((item) => item.name)).toEqual([
      'Inbox',
      'New Name',
    ]);
  });

  it('prevents Inbox from being renamed or deleted', async () => {
    const storage = new MemoryStorageAdapter();
    const repository = createRepository(storage);
    await repository.initialize();
    const writesBeforeActions = storage.writeCount;

    await expect(
      repository.renameProject(INBOX_PROJECT_ID, 'Other'),
    ).rejects.toBeInstanceOf(ProtectedInboxError);
    await expect(
      repository.deleteProjectAndMoveToInbox(INBOX_PROJECT_ID),
    ).rejects.toBeInstanceOf(ProtectedInboxError);
    expect(storage.writeCount).toBe(writesBeforeActions);
  });

  it('rejects a duplicate name while renaming', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['project-1', 'project-2'];
    const repository = new LinkShelfRepository(
      storage,
      () => now,
      () => ids.shift()!,
    );
    const first = await repository.createProject({ name: 'First' });
    await repository.createProject({ name: 'Second' });

    await expect(
      repository.renameProject(first.id, 'second'),
    ).rejects.toBeInstanceOf(DuplicateProjectNameError);
  });

  it('deletes a project by moving every link and session to Inbox', async () => {
    const storage = new MemoryStorageAdapter();
    const ids = ['project-1', 'session-1', 'link-1'];
    let currentTime = now;
    const repository = new LinkShelfRepository(
      storage,
      () => currentTime,
      () => ids.shift()!,
    );
    const project = await repository.createProject({ name: 'Temporary' });
    const parked = await repository.parkTab({
      projectId: project.id,
      title: 'Example',
      url: 'https://example.com',
      pinnedBeforeParking: false,
    });
    await repository.markLinkRestored(parked.link.id);
    await repository.updateDatabase((database) => ({
      ...database,
      settings: {
        ...database.settings,
        defaultProjectId: project.id,
      },
    }));
    currentTime = '2026-08-10T15:00:00.000Z';

    const result = await repository.deleteProjectAndMoveToInbox(project.id);
    const database = await repository.getDatabase();

    expect(result).toEqual({
      deletedProjectId: project.id,
      inboxProjectId: INBOX_PROJECT_ID,
      movedLinks: 1,
      movedSessions: 1,
    });
    expect(database.projects.some((item) => item.id === project.id)).toBe(false);
    expect(database.links[0]).toMatchObject({
      projectId: INBOX_PROJECT_ID,
      status: 'restored',
      updatedAt: currentTime,
    });
    expect(database.sessions[0]).toMatchObject({
      projectId: INBOX_PROJECT_ID,
      updatedAt: currentTime,
    });
    expect(database.settings.defaultProjectId).toBe(INBOX_PROJECT_ID);
  });
});
