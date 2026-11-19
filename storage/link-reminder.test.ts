import { describe, expect, it } from 'vitest';
import { InvalidReminderError } from '@/domain/reminders';
import type { StorageAdapter } from './storage-adapter';
import { InvalidLinkStateError, LinkShelfRepository } from './repository';

class Memory implements StorageAdapter {
  values = new Map<string, unknown>();
  async get(key: string) { return this.values.get(key); }
  async set(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
}

async function setup() {
  let counter = 0;
  const repository = new LinkShelfRepository(new Memory(), () => '2026-11-19T10:00:00.000Z', () => `id-${++counter}`);
  const { link } = await repository.parkTab({ title: 'Alpha', url: 'https://a.example/', pinnedBeforeParking: false });
  return { repository, link };
}

describe('setting a link reminder', () => {
  it('sets, snoozes and clears a reminder on a parked link', async () => {
    const { repository, link } = await setup();
    const set = await repository.setLinkReminder(link.id, '2026-11-20T09:00:00.000Z');
    expect(set.reminderAt).toBe('2026-11-20T09:00:00.000Z');

    // Snoozing a notified reminder makes it pending again.
    await repository.updateDatabase((database) => ({ ...database, links: database.links.map((item) => ({ ...item, reminderNotifiedAt: '2026-11-20T09:01:00.000Z' })) }));
    const snoozed = await repository.setLinkReminder(link.id, '2026-11-21T09:00:00.000Z');
    expect(snoozed).toMatchObject({ reminderAt: '2026-11-21T09:00:00.000Z' });
    expect(snoozed).not.toHaveProperty('reminderNotifiedAt');

    const cleared = await repository.setLinkReminder(link.id, null);
    expect(cleared).not.toHaveProperty('reminderAt');
    expect(cleared).not.toHaveProperty('reminderNotifiedAt');
  });

  it('rejects past, invalid and far-future times and non-parked links without changing data', async () => {
    const { repository, link } = await setup();
    for (const value of ['2026-11-19T09:00:00.000Z', 'tomorrow', '2026-11-20T09:00:00Z', '2099-01-01T00:00:00.000Z']) {
      await expect(repository.setLinkReminder(link.id, value)).rejects.toBeInstanceOf(InvalidReminderError);
    }
    expect((await repository.getLink(link.id))?.reminderAt).toBeUndefined();
    await repository.archiveLink(link.id);
    await expect(repository.setLinkReminder(link.id, '2026-11-20T09:00:00.000Z')).rejects.toBeInstanceOf(InvalidLinkStateError);
  });
});
