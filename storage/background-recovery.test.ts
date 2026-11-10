import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDatabase } from '@/domain/defaults';
import { LinkShelfDatabaseSchema } from '@/domain/schemas';
import { isStorageRecoveryMessage } from '@/messaging/contracts';

const NOW = '2026-11-09T10:00:00.000Z';
function valid() {
  const database = createEmptyDatabase(NOW);
  database.settings.notificationsEnabled = false;
  database.sessions.push({ id: 'session', projectId: 'inbox', createdAt: NOW, updatedAt: NOW });
  database.links.push({
    id: 'link', sessionId: 'session', projectId: 'inbox', title: 'Synthetic private page',
    url: 'https://private.example/synthetic', normalizedUrl: 'https://private.example/synthetic', domain: 'private.example',
    note: 'Do not disclose this note', status: 'parked', pinnedBeforeParking: false, createdAt: NOW, updatedAt: NOW,
  });
  return database;
}
const backup = () => ({ format: 'linkshelf-backup', schemaVersion: 2, exportedAt: NOW, database: valid() });

describe('storage recovery through actual background messages', () => {
  let values: Record<string, any>;
  let api: any;
  let boot: () => void;
  let listener: (message: unknown, sender: unknown, reply: (response: any) => void) => boolean;
  function event() {
    const handlers = new Set<(...args: any[]) => void>();
    return { addListener: (callback: (...args: any[]) => void) => handlers.add(callback), fire: (...args: any[]) => [...handlers].forEach((callback) => callback(...args)) };
  }
  function request(message: unknown): Promise<any> {
    return new Promise((resolve, reject) => { if (!listener(message, {}, resolve)) reject(new Error('Unhandled recovery request')); });
  }
  function corrupt(value: unknown = { malformed: 'Original private content' }) {
    values.linkshelfDatabase = structuredClone(value);
    api.storage.onChanged.fire({ linkshelfDatabase: { newValue: value } }, 'local');
  }
  async function preview() {
    const exported = await request({ type: 'EXPORT_RECOVERY_DATA' });
    const prepared = await request({ type: 'PREVIEW_RECOVERY_BACKUP', payload: { backup: backup(), rawRevisionToken: exported.recovery.rawRevisionToken } });
    expect(prepared.success).toBe(true);
    return { type: 'RESTORE_RECOVERY_BACKUP', payload: { backup: backup(), rawRevisionToken: exported.recovery.rawRevisionToken, revisionToken: prepared.preview.revisionToken, confirmed: true } };
  }
  beforeEach(async () => {
    vi.resetModules();
    values = { linkshelfDatabase: valid(), unrelatedUserPreference: { keep: true } };
    api = {
      storage: { onChanged: event(), local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(values[key]) })),
        set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); api.storage.onChanged.fire(Object.fromEntries(Object.entries(patch).map(([key, newValue]) => [key, { newValue }])), 'local'); }),
      }, session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
      runtime: { getURL: (path: string) => path, onInstalled: event(), onStartup: event(), onMessage: { addListener: (callback: typeof listener) => { listener = callback; } } },
      tabs: { get: vi.fn(async () => ({ id: 1, windowId: 1, index: 0, pinned: false, title: 'Synthetic', url: 'https://example.com' })), query: vi.fn(async () => []), create: vi.fn(async () => ({ id: 100 })), remove: vi.fn(async () => undefined), discard: vi.fn(async () => ({ discarded: true })) },
      windows: { getLastFocused: vi.fn(async () => ({ id: 1 })) }, sidePanel: { open: vi.fn(async () => undefined) },
      alarms: { onAlarm: event(), getAll: vi.fn(async () => []), clear: vi.fn(async () => true), create: vi.fn(async () => undefined) },
      notifications: { getPermissionLevel: vi.fn(async () => 'granted'), getAll: vi.fn(async () => ({})), create: vi.fn(async () => 'notification') },
      commands: { onCommand: event() }, bookmarks: { getTree: vi.fn(async () => []), create: vi.fn(async () => ({ id: 'bookmark' })) },
    };
    vi.stubGlobal('browser', api);
    vi.stubGlobal('defineBackground', (callback: () => void) => callback);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    boot = (await import('../entrypoints/background')).default as unknown as () => void;
    boot();
    expect((await request({ type: 'GET_STORAGE_STATUS' })).status.state).toBe('healthy');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('detects external relational corruption instead of continuing with the cached database', async () => {
    const invalid = valid(); invalid.links[0].sessionId = 'orphan';
    corrupt(invalid);
    const response = await request({ type: 'GET_STORAGE_STATUS' });
    expect(response.status.state).toBe('recovery');
    expect(JSON.stringify(response)).not.toMatch(/private\.example|disclose this note/);
    expect((await request({ type: 'GET_PARKED_LINKS' })).success).toBe(false);
    expect(values.linkshelfDatabase).toEqual(invalid);
    expect(api.storage.local.set).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } },
    { type: 'RESTORE_LINK', payload: { linkId: 'link' } },
    { type: 'RESTORE_SESSION', payload: { sessionId: 'session' } },
    { type: 'RESTORE_PROJECT', payload: { projectId: 'inbox', mode: 'normal' } },
    { type: 'BOOKMARK_LINK', payload: { linkId: 'link', parentId: 'folder' } },
    { type: 'REMOVE_LINK', payload: { linkId: 'link' } },
  ])('blocks unsafe $type browser effects and writes when storage requires recovery', async (message) => {
    corrupt(); await request({ type: 'GET_STORAGE_STATUS' });
    expect((await request(message)).success).toBe(false);
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(api.tabs.remove).not.toHaveBeenCalled();
    expect(api.bookmarks.create).not.toHaveBeenCalled();
    expect(api.storage.local.set).not.toHaveBeenCalled();
  });

  it('exports original malformed data and rejects a restore without explicit confirmation', async () => {
    corrupt(); await request({ type: 'GET_STORAGE_STATUS' });
    const raw = structuredClone(values.linkshelfDatabase);
    const message = await preview(); message.payload.confirmed = false;
    expect((await request(message)).success).toBe(false);
    expect((await request({ type: 'EXPORT_RECOVERY_DATA' })).recovery.rawValue).toEqual(raw);
    expect(values.linkshelfDatabase).toEqual(raw);
    expect(api.storage.local.set).not.toHaveBeenCalled();
  });

  it('restores a validated backup, preserves unrelated keys, and survives a new worker instance', async () => {
    corrupt(); await request({ type: 'GET_STORAGE_STATUS' });
    const message = await preview();
    expect(await request(message)).toMatchObject({ success: true, result: { mode: 'replace', linksAdded: 1 } });
    expect(values.linkshelfDatabase).toEqual(valid());
    expect(values.unrelatedUserPreference).toEqual({ keep: true });
    expect(LinkShelfDatabaseSchema.safeParse(values.linkshelfDatabase).success).toBe(true);
    boot();
    expect((await request({ type: 'GET_STORAGE_STATUS' })).status.state).toBe('healthy');
    expect((await request({ type: 'GET_PARKED_LINKS' })).links[0].id).toBe('link');
  });

  it('preserves successful recovery and reports a secondary reminder warning', async () => {
    corrupt(); await request({ type: 'GET_STORAGE_STATUS' });
    const message = await preview();
    api.alarms.getAll.mockRejectedValueOnce(new Error('Alarm API unavailable'));
    expect(await request(message)).toMatchObject({ success: true, warnings: [expect.stringContaining('backup was restored')] });
    expect(values.linkshelfDatabase).toEqual(valid());
    expect((await request({ type: 'GET_STORAGE_STATUS' })).status.state).toBe('healthy');
  });

  it('preserves raw data and reports failure if a recovery write fails', async () => {
    corrupt(); await request({ type: 'GET_STORAGE_STATUS' });
    const raw = structuredClone(values.linkshelfDatabase);
    const message = await preview();
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    expect((await request(message)).success).toBe(false);
    expect(values.linkshelfDatabase).toEqual(raw);
    expect(values.unrelatedUserPreference).toEqual({ keep: true });
    expect((await request({ type: 'GET_STORAGE_STATUS' })).status.state).toBe('recovery');
  });

  it('permits an explicit recheck after an external valid restore and rejects raw files as backups', async () => {
    corrupt(); await request({ type: 'GET_STORAGE_STATUS' });
    const exported = await request({ type: 'EXPORT_RECOVERY_DATA' });
    expect((await request({ type: 'PREVIEW_RECOVERY_BACKUP', payload: { backup: exported.recovery, rawRevisionToken: exported.recovery.rawRevisionToken } })).success).toBe(false);
    values.linkshelfDatabase = valid();
    api.storage.onChanged.fire({ linkshelfDatabase: { newValue: values.linkshelfDatabase } }, 'local');
    expect((await request({ type: 'GET_STORAGE_STATUS' })).status.state).toBe('recovery');
    expect((await request({ type: 'RECHECK_STORAGE' })).status.state).toBe('healthy');
  });

  it('guards the recovery protocol against malformed requests', () => {
    expect(isStorageRecoveryMessage({ type: 'RESTORE_RECOVERY_BACKUP', payload: {} })).toBe(false);
    expect(isStorageRecoveryMessage({ type: 'PREVIEW_RECOVERY_BACKUP', payload: null })).toBe(false);
    expect(isStorageRecoveryMessage(null)).toBe(false);
    expect(isStorageRecoveryMessage({ type: 'RESTORE_RECOVERY_BACKUP', payload: { backup: backup(), rawRevisionToken: 'token', revisionToken: 'preview', confirmed: false } })).toBe(true);
  });
});
