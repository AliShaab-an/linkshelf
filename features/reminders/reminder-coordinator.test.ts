import { describe, expect, it, vi } from 'vitest';
import { createEmptyDatabase } from '@/domain/defaults';
import type { LinkShelfDatabase } from '@/domain/schemas';
import { DATABASE_STORAGE_KEY, LinkShelfRepository } from '@/storage/repository';
import { createReminderCoordinator } from './reminder-coordinator';
import { reminderAlarmName } from './reminder-service';

const START = '2026-11-09T10:00:00.000Z';
const FUTURE = '2026-11-09T11:00:00.000Z';
const LATER = '2026-11-09T12:00:00.000Z';
const PAST = '2026-11-09T09:00:00.000Z';

async function fixture() {
  let clock = Date.parse(START);
  let nextId = 0;
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => { values.set(key, structuredClone(value)); }),
  };
  let repository = new LinkShelfRepository(storage, () => new Date(clock).toISOString(), () => `record-${++nextId}`);
  await repository.initialize();
  const scheduled = new Map<string, number>();
  const active: Record<string, unknown> = {};
  const alarms = {
    getAll: vi.fn(async () => [...scheduled].map(([name, scheduledTime]) => ({ name, scheduledTime }))),
    create: vi.fn(async (name: string, info: { when: number }) => { scheduled.set(name, info.when); }),
    clear: vi.fn(async (name: string) => scheduled.delete(name)),
  };
  const dependencies = {
    getDatabase: () => repository.getDatabase(),
    markNotified: vi.fn((ids: string[], time: string) => repository.markReminderGroupNotified(ids, time)),
    alarms,
    now: () => clock,
    getPermission: vi.fn(async () => 'granted'),
    getNotifications: vi.fn(async () => ({ ...active })),
    createNotification: vi.fn(async (id: string, options: unknown) => { active[id] = options; }),
  };
  let coordinator = createReminderCoordinator(dependencies);
  return {
    get repository() { return repository; },
    get coordinator() { return coordinator; },
    storage, scheduled, active, dependencies, alarms,
    stored: () => structuredClone(values.get(DATABASE_STORAGE_KEY)) as LinkShelfDatabase,
    advance: (time: string) => { clock = Date.parse(time); },
    restart: () => {
      repository = new LinkShelfRepository(storage, () => new Date(clock).toISOString());
      coordinator = createReminderCoordinator(dependencies);
    },
    park: (reminderAt = FUTURE, count = 2) => repository.parkTabs({
      projectId: 'inbox', reminderAt, note: 'Review synthetic links',
      tabs: Array.from({ length: count }, (_, index) => ({
        title: `Synthetic ${index}`, url: `https://example.com/${nextId}/${index}`, pinnedBeforeParking: false,
      })),
    }),
  };
}

describe('reminder reconciliation with persisted schema-2 data', () => {
  it('schedules a new session once, preserves timestamps, and leaves future links out of Today', async () => {
    const f = await fixture();
    const saved = await f.park();
    await f.coordinator.reconcile();
    expect([...f.scheduled]).toEqual([[reminderAlarmName(saved.links[0].id), Date.parse(FUTURE)]]);
    expect(f.stored().links.map((link) => link.reminderAt)).toEqual([FUTURE, FUTURE]);
    expect(await f.repository.getDueReminderLinks(START)).toEqual([]);
    await f.coordinator.reconcile();
    expect(f.alarms.create).toHaveBeenCalledTimes(1);
    expect(f.dependencies.createNotification).not.toHaveBeenCalled();
  });

  it('keeps different reminder times in one legacy session independent', async () => {
    const f = await fixture();
    const saved = await f.park(PAST);
    await f.repository.updateDatabase((database) => ({ ...database, links: database.links.map((link, index) => index ? { ...link, reminderAt: FUTURE } : link) }));
    await f.coordinator.reconcile();
    expect(f.stored().links[0].reminderNotifiedAt).toBe(START);
    expect(f.stored().links[1].reminderNotifiedAt).toBeUndefined();
    expect([...f.scheduled.keys()]).toEqual([reminderAlarmName(saved.links[1].id)]);
    expect(await f.repository.getDueReminderLinks(START)).toHaveLength(1);
  });

  it.each([0, 1])('keeps reminders when moving link index %i and fixes both session alarms', async (index) => {
    const f = await fixture();
    const saved = await f.park();
    await f.coordinator.reconcile();
    const project = await f.repository.createProject({ name: 'Destination' });
    const moved = await f.repository.moveLinkToProject(saved.links[index].id, project.id);
    await f.coordinator.reconcile();
    expect(moved).toMatchObject({ id: saved.links[index].id, projectId: project.id, reminderAt: FUTURE });
    expect(moved.sessionId).not.toBe(saved.session.id);
    expect(f.stored().links[1 - index]).toEqual(saved.links[1 - index]);
    expect([...f.scheduled.keys()].sort()).toEqual(saved.links.map((link) => reminderAlarmName(link.id)).sort());
    f.advance(FUTURE);
    await f.coordinator.reconcile();
    expect(f.scheduled.size).toBe(0);
    expect(Object.keys(f.active)).toHaveLength(2);
    expect(await f.repository.getDueReminderLinks(FUTURE)).toHaveLength(2);
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === FUTURE)).toBe(true);
  });

  it('preserves acknowledgment when an already-notified link moves', async () => {
    const f = await fixture();
    const saved = await f.park(PAST);
    await f.coordinator.reconcile();
    const project = await f.repository.createProject({ name: 'Destination' });
    await f.repository.moveLinkToProject(saved.links[0].id, project.id);
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
    expect(f.scheduled.size).toBe(0);
  });

  it.each(['restore', 'archive', 'remove'] as const)('replaces the representative after %s and clears the final obsolete alarm', async (action) => {
    const f = await fixture();
    const saved = await f.park();
    const change = (id: string) => action === 'restore' ? f.repository.markLinkRestored(id) : action === 'archive' ? f.repository.archiveLink(id) : f.repository.removeLink(id);
    await f.coordinator.reconcile();
    await change(saved.links[0].id);
    await f.coordinator.reconcile();
    expect([...f.scheduled.keys()]).toEqual([reminderAlarmName(saved.links[1].id)]);
    await change(saved.links[1].id);
    await f.coordinator.reconcile();
    expect(f.scheduled.size).toBe(0);
    expect(f.stored().links.every((link) => link.reminderAt === FUTURE && !link.reminderNotifiedAt)).toBe(true);
  });

  it('recovers an unarchived pending reminder without changing historical timestamps', async () => {
    const f = await fixture();
    const saved = await f.park(FUTURE, 1);
    await f.repository.archiveLink(saved.links[0].id);
    f.advance(LATER);
    await f.coordinator.reconcile();
    expect(Object.keys(f.active)).toHaveLength(0);
    await f.repository.unarchiveLink(saved.links[0].id);
    await f.coordinator.reconcile();
    expect(f.stored().links[0]).toMatchObject({ status: 'parked', reminderAt: FUTURE, reminderNotifiedAt: LATER });
    expect(await f.repository.getDueReminderLinks(LATER)).toHaveLength(1);
  });

  it('does not re-notify an acknowledged reminder after archive and unarchive', async () => {
    const f = await fixture();
    const saved = await f.park(PAST, 1);
    await f.coordinator.reconcile();
    await f.repository.archiveLink(saved.links[0].id);
    await f.repository.unarchiveLink(saved.links[0].id);
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
    expect(f.stored().links[0].reminderNotifiedAt).toBe(START);
  });

  it.each(['future', 'overdue'] as const)('recovers %s reminders from storage after worker restart and alarm loss', async (kind) => {
    const f = await fixture();
    await f.park();
    await f.coordinator.reconcile();
    f.scheduled.clear();
    if (kind === 'overdue') f.advance(LATER);
    f.restart();
    await f.coordinator.reconcile();
    expect(f.scheduled.size).toBe(kind === 'future' ? 1 : 0);
    expect(f.stored().links.every((link) => Boolean(link.reminderNotifiedAt) === (kind === 'overdue'))).toBe(true);
    expect(Object.keys(f.active)).toHaveLength(kind === 'overdue' ? 1 : 0);
  });

  it('does not repeat acknowledged overdue reminders after browser-style state reload', async () => {
    const f = await fixture();
    await f.park(PAST);
    await f.coordinator.reconcile();
    Object.keys(f.active).forEach((id) => delete f.active[id]);
    f.restart();
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
    expect(await f.repository.getDueReminderLinks(START)).toHaveLength(2);
  });

  it('serializes repeated concurrent checks into a single notification occurrence', async () => {
    const f = await fixture();
    await f.park(PAST);
    await Promise.all(Array.from({ length: 8 }, () => f.coordinator.reconcile()));
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
  });

  it('keeps failed notifications pending and retries only on another explicit check', async () => {
    const f = await fixture();
    await f.park(PAST);
    f.dependencies.createNotification.mockRejectedValueOnce(new Error('Notification API unavailable'));
    await expect(f.coordinator.reconcile()).rejects.toThrow('Pending reminders');
    expect(f.stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
    expect(await f.repository.getDueReminderLinks(START)).toHaveLength(2);
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
    await f.coordinator.reconcile();
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(2);
  });

  it('reuses a visible notification after acknowledgment persistence fails', async () => {
    const f = await fixture();
    await f.park(PAST);
    f.storage.set.mockRejectedValueOnce(new Error('Disk unavailable'));
    await expect(f.coordinator.reconcile()).rejects.toThrow();
    expect(Object.keys(f.active)).toHaveLength(1);
    expect(f.stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
    f.restart();
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
  });

  it('retains disabled reminders and delivers them on re-enable', async () => {
    const f = await fixture();
    await f.park(PAST);
    await f.repository.updateSettings({ ...(await f.repository.getSettings()), notificationsEnabled: false });
    await f.coordinator.reconcile();
    expect(f.dependencies.getPermission).not.toHaveBeenCalled();
    expect(f.stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
    expect(await f.repository.getDueReminderLinks(START)).toHaveLength(2);
    await f.repository.updateSettings({ ...(await f.repository.getSettings()), notificationsEnabled: true });
    await f.coordinator.reconcile();
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
  });

  it.each(['denied', 'error'] as const)('keeps reminders pending on permission %s, then recovers', async (kind) => {
    const f = await fixture();
    await f.park(PAST);
    if (kind === 'denied') f.dependencies.getPermission.mockResolvedValueOnce('denied');
    else f.dependencies.getPermission.mockRejectedValueOnce(new Error('Permission API unavailable'));
    await expect(f.coordinator.reconcile()).rejects.toThrow();
    expect(f.dependencies.createNotification).not.toHaveBeenCalled();
    expect(f.stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
  });

  it('keeps reminders pending when active-notification enumeration fails', async () => {
    const f = await fixture();
    await f.park(PAST);
    f.dependencies.getNotifications.mockRejectedValueOnce(new Error('Notification API unavailable'));
    await expect(f.coordinator.reconcile()).rejects.toThrow();
    expect(f.dependencies.createNotification).not.toHaveBeenCalled();
    expect(f.stored().links.every((link) => !link.reminderNotifiedAt)).toBe(true);
  });

  it('creates missing future alarms even if clearing a stale alarm fails', async () => {
    const f = await fixture();
    const saved = await f.park();
    f.scheduled.set('linkshelf-reminder:stale', 1);
    f.scheduled.set('unrelated', 2);
    f.alarms.clear.mockRejectedValueOnce(new Error('Clear failed'));
    await expect(f.coordinator.reconcile()).rejects.toThrow();
    expect(f.scheduled.get(reminderAlarmName(saved.links[0].id))).toBe(Date.parse(FUTURE));
    expect(f.scheduled.get('unrelated')).toBe(2);
    await f.coordinator.reconcile();
    expect(f.scheduled.has('linkshelf-reminder:stale')).toBe(false);
  });

  it('retains data after alarm creation failure and repairs the missing alarm later', async () => {
    const f = await fixture();
    await f.park();
    const before = f.stored();
    f.alarms.create.mockRejectedValueOnce(new Error('Alarm limit'));
    await expect(f.coordinator.reconcile()).rejects.toThrow();
    expect(f.stored()).toEqual(before);
    expect(f.scheduled.size).toBe(0);
    await f.coordinator.reconcile();
    expect(f.scheduled.size).toBe(1);
  });

  it('delivers overdue groups even when alarm enumeration fails', async () => {
    const f = await fixture();
    await f.park(PAST);
    f.alarms.getAll.mockRejectedValueOnce(new Error('Alarms unavailable'));
    await expect(f.coordinator.reconcile()).rejects.toThrow();
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
  });

  it('continues delivering independent groups after one notification fails', async () => {
    const f = await fixture();
    await f.park(PAST, 1);
    await f.park(PAST, 1);
    f.dependencies.createNotification.mockRejectedValueOnce(new Error('First notification failed'));
    await expect(f.coordinator.reconcile()).rejects.toThrow();
    expect(f.stored().links.map((link) => Boolean(link.reminderNotifiedAt))).toEqual([false, true]);
    await f.coordinator.reconcile();
    expect(f.stored().links.every((link) => link.reminderNotifiedAt === START)).toBe(true);
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(3);
  });

  it.each(['archive', 'disable'] as const)('rechecks %s changes made while permission lookup yields', async (change) => {
    const f = await fixture();
    const saved = await f.park(PAST, 1);
    f.dependencies.getPermission.mockImplementationOnce(async () => {
      if (change === 'archive') await f.repository.archiveLink(saved.links[0].id);
      else await f.repository.updateSettings({ ...(await f.repository.getSettings()), notificationsEnabled: false });
      return 'granted';
    });
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).not.toHaveBeenCalled();
    expect(f.stored().links[0].reminderNotifiedAt).toBeUndefined();
  });

  it('acknowledges only the requested eligible occurrence and preserves history', async () => {
    const f = await fixture();
    const saved = await f.park(PAST, 4);
    await f.repository.archiveLink(saved.links[1].id);
    await f.repository.markReminderNotified(saved.links[2].id);
    f.advance(LATER);
    await f.repository.updateDatabase((database) => ({ ...database, links: database.links.map((link, index) => index === 3 ? { ...link, reminderAt: FUTURE } : link) }));
    await f.repository.markReminderGroupNotified(saved.links.map((link) => link.id), PAST);
    expect(f.stored().links.map((link) => link.reminderNotifiedAt)).toEqual([LATER, undefined, START, undefined]);
  });

  it('skips a later group removed while another notification is being created', async () => {
    const f = await fixture();
    await f.park(PAST, 1);
    const later = await f.park(PAST, 1);
    const create = f.dependencies.createNotification.getMockImplementation()!;
    f.dependencies.createNotification.mockImplementationOnce(async (id, options) => {
      await create(id, options);
      await f.repository.removeLink(later.links[0].id);
    });
    await f.coordinator.reconcile();
    expect(f.dependencies.createNotification).toHaveBeenCalledTimes(1);
    expect(f.stored().links[0].reminderNotifiedAt).toBe(START);
    expect(f.stored().links[1]).toMatchObject({ status: 'removed', reminderAt: PAST });
    expect(f.stored().links[1].reminderNotifiedAt).toBeUndefined();
  });

  it('round-trips legacy schema-2 reminder states through replace and merge backups', async () => {
    const f = await fixture();
    const saved = await f.park(FUTURE);
    await f.repository.markReminderNotified(saved.links[0].id);
    const backup = await f.repository.exportBackup();
    expect(backup.schemaVersion).toBe(2);
    for (const mode of ['replace', 'merge'] as const) {
      const target = await fixture();
      const preview = await target.repository.previewImportBackup(backup, mode);
      await target.repository.importBackup(backup, mode, preview.revisionToken);
      await target.coordinator.reconcile();
      expect(target.stored().links).toEqual(backup.database.links);
      expect([...target.scheduled.keys()]).toEqual([reminderAlarmName(saved.links[1].id)]);
    }
    expect(createEmptyDatabase(START).settings.schemaVersion).toBe(2);
  });
});
