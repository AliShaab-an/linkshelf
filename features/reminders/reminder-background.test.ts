import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkShelfBackup, LinkShelfDatabase, SavedLink } from '@/domain/schemas';
import { reminderAlarmName } from './reminder-service';

const START = '2026-11-09T10:00:00.000Z';
const FUTURE = '2026-11-09T11:00:00.000Z';
const LATER = '2026-11-09T12:00:00.000Z';
const PAST = '2026-11-09T09:00:00.000Z';

describe('actual background reminder handlers', () => {
  let values: Record<string, any>;
  let listener: (message: unknown, sender: unknown, reply: (response: any) => void) => boolean;
  let api: any;
  let boot: () => void;
  let scheduled: Map<string, number>;
  let active: Record<string, unknown>;
  const stored = () => values.linkshelfDatabase as LinkShelfDatabase;

  function event() {
    let handler: (...args: any[]) => void = () => undefined;
    return {
      addListener: (callback: typeof handler) => { handler = callback; },
      fire: (...args: any[]) => handler(...args),
    };
  }
  function request(message: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!listener(message, {}, resolve)) reject(new Error('Unhandled message'));
    });
  }
  async function today() { return request({ type: 'GET_DUE_REMINDER_LINKS' }); }
  async function settings(patch: Record<string, unknown>) {
    const current = await request({ type: 'GET_SETTINGS' });
    return request({ type: 'UPDATE_SETTINGS', payload: { ...current.settings, ...patch } });
  }
  async function park(reminderAt = FUTURE, tabIds = [1, 2]) {
    const response = await request({ type: 'PARK_SELECTED_TABS', payload: { tabIds, projectId: 'inbox', reminderAt } });
    expect(response.saved).toBe(true);
    return stored().links.filter((link) => response.linkIds.includes(link.id));
  }
  async function destination() {
    return (await request({ type: 'CREATE_PROJECT', payload: { name: 'Synthetic destination' } })).project.id as string;
  }
  async function importBackup(backup: LinkShelfBackup, mode: 'replace' | 'merge') {
    const preview = await request({ type: 'PREVIEW_IMPORT_DATA', payload: { backup, mode } });
    return request({ type: 'IMPORT_DATA', payload: { backup, mode, revisionToken: preview.preview.revisionToken } });
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    values = {};
    scheduled = new Map();
    active = {};
    api = {
      storage: { local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(values[key]) })),
        set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); }),
      }, session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
      runtime: { getURL: (path: string) => path, onInstalled: event(), onStartup: event(), onMessage: {
        addListener: (callback: typeof listener) => { listener = callback; },
      } },
      alarms: {
        onAlarm: event(),
        getAll: vi.fn(async () => [...scheduled].map(([name, scheduledTime]) => ({ name, scheduledTime }))),
        create: vi.fn(async (name: string, info: { when: number }) => { scheduled.set(name, info.when); }),
        clear: vi.fn(async (name: string) => scheduled.delete(name)),
      },
      notifications: {
        onPermissionLevelChanged: event(),
        getPermissionLevel: vi.fn(async () => 'granted'),
        getAll: vi.fn(async () => ({ ...active })),
        create: vi.fn(async (id: string, options: unknown) => { active[id] = options; return id; }),
      },
      tabs: {
        get: vi.fn(async (id: number) => ({ id, windowId: 1, index: id, pinned: false, title: `Synthetic ${id}`, url: `https://example.com/${id}` })),
        query: vi.fn(async () => []), remove: vi.fn(async () => undefined),
        create: vi.fn(async () => ({ id: 100 })), discard: vi.fn(async () => ({ discarded: true })),
      },
      windows: { getLastFocused: vi.fn(async () => ({ id: 1 })) },
      sidePanel: { open: vi.fn(async () => undefined) },
      bookmarks: { getTree: vi.fn(async () => []), create: vi.fn(async () => ({ id: 'bookmark' })) },
      commands: { onCommand: event() },
    };
    vi.stubGlobal('browser', api);
    vi.stubGlobal('defineBackground', (callback: () => void) => callback);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    boot = (await import('../../entrypoints/background')).default as unknown as () => void;
    boot();
    await today();
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('repairs a missing reminder alarm on an unchanged settings save without rewriting the library', async () => {
    const [link] = await park();
    scheduled.clear();
    api.storage.local.set.mockClear();
    const before = structuredClone(stored());
    const response = await settings({});
    expect(response).toEqual({ success: true, settings: before.settings, warnings: [] });
    expect(scheduled.has(reminderAlarmName(link.id))).toBe(true);
    expect(api.storage.local.set).not.toHaveBeenCalled();
    expect(stored()).toEqual(before);
  });

  it('returns Merge counts and a reminder warning without rewriting an identical library', async () => {
    await park();
    const before = structuredClone(stored());
    const { backup } = await request({ type: 'EXPORT_DATA' });
    api.storage.local.set.mockClear();
    api.alarms.getAll.mockRejectedValueOnce(new Error('alarm access failed'));
    const response = await importBackup(backup, 'merge');
    expect(response).toEqual({
      success: true,
      result: { mode: 'merge', projectsAdded: 0, sessionsAdded: 0, linksAdded: 0, recordsSkipped: 4 },
      warnings: ['Your backup was imported, but reminders could not be updated. Reload LinkShelf to retry reminders.'],
    });
    expect(api.storage.local.set).not.toHaveBeenCalled();
    expect(stored()).toEqual(before);
  });

  it('creates one alarm and acknowledges both due links only after notification creation', async () => {
    const links = await park();
    expect([...scheduled]).toEqual([[reminderAlarmName(links[0].id), Date.parse(FUTURE)]]);
    expect((await today()).links).toHaveLength(0);
    expect(stored().sessions[0].reminderAt).toBe(FUTURE);
    vi.setSystemTime(FUTURE);
    api.alarms.onAlarm.fire({ name: reminderAlarmName(links[0].id) });
    const response = await today();
    expect(response.links.map((link: SavedLink) => link.id).sort()).toEqual(links.map((link) => link.id).sort());
    expect(stored().links.every((link) => link.reminderAt === FUTURE && link.reminderNotifiedAt === FUTURE)).toBe(true);
    expect(scheduled.size).toBe(0);
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])('reconciles actual MOVE_LINK for link %i and preserves Today ownership', async (index) => {
    const links = await park();
    const projectId = await destination();
    const result = await request({ type: 'MOVE_LINK', payload: { linkId: links[index].id, projectId } });
    expect(result).toMatchObject({ success: true, link: { id: links[index].id, reminderAt: FUTURE, projectId } });
    expect([...scheduled.keys()].sort()).toEqual(links.map((link) => reminderAlarmName(link.id)).sort());
    expect(stored().links.find((link) => link.id === links[1 - index].id)).toEqual(links[1 - index]);
    vi.setSystemTime(FUTURE);
    const response = await today();
    expect(response.links).toHaveLength(2);
    expect(response.links.find((link: SavedLink) => link.id === links[index].id).projectId).toBe(projectId);
    expect(api.notifications.create).toHaveBeenCalledTimes(2);
    expect(scheduled.size).toBe(0);
  });

  it('restores the representative and then final link without losing the remaining alarm', async () => {
    const links = await park();
    for (let index = 0; index < links.length; index++) {
      const result = await request({ type: 'RESTORE_LINK', payload: { linkId: links[index].id } });
      expect(result).toMatchObject({ success: true, restored: true });
      expect([...scheduled.keys()]).toEqual(index ? [] : [reminderAlarmName(links[1].id)]);
    }
    expect(stored().links.every((link) => link.status === 'restored' && link.reminderAt === FUTURE && !link.reminderNotifiedAt)).toBe(true);
  });

  it.each(['RESTORE_SESSION', 'RESTORE_PROJECT'])('removes alarms after full %s', async (type) => {
    await park();
    const payload = type === 'RESTORE_SESSION' ? { sessionId: stored().sessions[0].id } : { projectId: 'inbox', mode: 'normal' };
    const result = await request({ type, payload });
    expect(result).toMatchObject({ success: true });
    expect(result.restoredLinkIds).toHaveLength(2);
    expect(stored().links.every((link) => link.status === 'restored' && link.reminderAt === FUTURE)).toBe(true);
    expect(scheduled.size).toBe(0);
  });

  it('keeps an alarm when restore opens a copy instead of retiring the record', async () => {
    const links = await park();
    await settings({ defaultRestoreBehavior: 'open-copy' });
    const result = await request({ type: 'RESTORE_LINK', payload: { linkId: links[0].id } });
    expect(result).toMatchObject({ success: true, opened: true, restored: false });
    expect(stored().links.every((link) => link.status === 'parked')).toBe(true);
    expect([...scheduled.keys()]).toEqual([reminderAlarmName(links[0].id)]);
  });

  it('keeps the correct alarm after a partial session-open failure', async () => {
    const links = await park();
    api.tabs.create.mockResolvedValueOnce({ id: 100 }).mockRejectedValueOnce(new Error('Cannot open second tab'));
    const result = await request({ type: 'RESTORE_SESSION', payload: { sessionId: links[0].sessionId } });
    expect(result).toMatchObject({ success: true, complete: false, failedLinkIds: [links[1].id] });
    expect(stored().links.map((link) => link.status)).toEqual(['restored', 'parked']);
    expect([...scheduled.keys()]).toEqual([reminderAlarmName(links[1].id)]);
  });

  it('repairs alarms after partial collection persistence failure without misreporting progress', async () => {
    const links = await park();
    const set = api.storage.local.set.getMockImplementation();
    api.storage.local.set.mockImplementationOnce(set).mockRejectedValueOnce(new Error('Second write failed'));
    const result = await request({ type: 'RESTORE_SESSION', payload: { sessionId: links[0].sessionId } });
    expect(result).toMatchObject({ success: false, error: { code: 'STORAGE_FAILED' } });
    expect(result.progress.restoredLinkIds).toHaveLength(1);
    expect(stored().links.map((link) => link.status)).toEqual(['restored', 'parked']);
    expect([...scheduled.keys()]).toEqual([reminderAlarmName(links[1].id)]);
  });

  it('reconciles archive, unarchive, and removal while retaining reminder history', async () => {
    const [link] = await park(FUTURE, [1]);
    await request({ type: 'ARCHIVE_LINK', payload: { linkId: link.id } });
    expect(scheduled.size).toBe(0);
    await request({ type: 'UNARCHIVE_LINK', payload: { linkId: link.id } });
    expect([...scheduled.keys()]).toEqual([reminderAlarmName(link.id)]);
    await request({ type: 'REMOVE_LINK', payload: { linkId: link.id } });
    expect(stored().links[0]).toMatchObject({ status: 'removed', reminderAt: FUTURE });
    expect(scheduled.size).toBe(0);
    vi.setSystemTime(LATER);
    expect((await today()).links).toHaveLength(0);
    expect(api.notifications.create).not.toHaveBeenCalled();
  });

  it('retains pending state on permission denial and exposes a Today warning', async () => {
    api.notifications.getPermissionLevel.mockResolvedValue('denied');
    await park(PAST);
    const response = await today();
    expect(response).toMatchObject({ success: true, warnings: [expect.stringContaining('notification delivery')] });
    expect(response.links).toHaveLength(2);
    expect(stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
    api.notifications.getPermissionLevel.mockResolvedValue('granted');
    api.notifications.onPermissionLevelChanged.fire('granted');
    await today();
    expect(stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
  });

  it('re-enables pending overdue reminders and reports failed delivery without undoing settings', async () => {
    await settings({ notificationsEnabled: false });
    await park(PAST);
    expect((await today()).warnings).toEqual([]);
    expect(api.notifications.create).not.toHaveBeenCalled();
    api.notifications.create.mockRejectedValueOnce(new Error('Notification delivery unavailable'));
    const result = await settings({ notificationsEnabled: true });
    expect(result).toMatchObject({ success: true, settings: { notificationsEnabled: true }, warnings: [expect.any(String)] });
    expect(stored().settings.notificationsEnabled).toBe(true);
    expect(stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
    await today();
    expect(stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
  });

  it.each(['worker', 'browser'] as const)('recovers lost future alarms on %s initialization', async (kind) => {
    const links = await park();
    scheduled.clear();
    if (kind === 'worker') boot();
    else api.runtime.onStartup.fire();
    await today();
    expect([...scheduled.keys()]).toEqual([reminderAlarmName(links[0].id)]);
    expect(stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
  });

  it.each(['worker', 'browser'] as const)('recovers overdue reminders on %s initialization and avoids redelivery', async (kind) => {
    await park();
    scheduled.clear();
    vi.setSystemTime(LATER);
    if (kind === 'worker') boot();
    else api.runtime.onStartup.fire();
    await today();
    expect(stored().links.every((link) => link.reminderNotifiedAt === LATER)).toBe(true);
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
    boot();
    await today();
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('recovers all eligible overdue links when an alarm refers to a removed representative', async () => {
    const links = await park();
    await request({ type: 'REMOVE_LINK', payload: { linkId: links[0].id } });
    vi.setSystemTime(FUTURE);
    api.alarms.onAlarm.fire({ name: reminderAlarmName(links[0].id) });
    await today();
    expect(stored().links[0].reminderNotifiedAt).toBeUndefined();
    expect(stored().links[1].reminderNotifiedAt).toBe(FUTURE);
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('preserves successful moves and reports alarm failure with repair on the next check', async () => {
    const links = await park();
    const projectId = await destination();
    api.alarms.create.mockRejectedValueOnce(new Error('Alarm service unavailable'));
    const result = await request({ type: 'MOVE_LINK', payload: { linkId: links[0].id, projectId } });
    expect(result).toMatchObject({ success: true, link: { projectId }, warnings: [expect.any(String)] });
    expect(stored().links[0].projectId).toBe(projectId);
    await today();
    expect([...scheduled.keys()].sort()).toEqual(links.map((link) => reminderAlarmName(link.id)).sort());
  });

  it.each(['replace', 'merge'] as const)('preserves reminder IDs and acknowledgment on a schema-2 %s import', async (mode) => {
    const links = await park(PAST);
    const exported = await request({ type: 'EXPORT_DATA' });
    const result = await importBackup(exported.backup, mode);
    expect(result.success).toBe(true);
    expect(stored().links.map((link) => link.id)).toEqual(links.map((link) => link.id));
    expect(stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
    expect(stored().settings.schemaVersion).toBe(2);
  });
});
