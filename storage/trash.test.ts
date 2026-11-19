import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from './storage-adapter';
import { InvalidLinkStateError, LinkShelfRepository } from './repository';

class Memory implements StorageAdapter {
  values = new Map<string, unknown>();
  async get(key: string) { return this.values.get(key); }
  async set(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
}

async function setup() {
  let current = '2026-08-01T12:00:00.000Z';
  let counter = 0;
  const repository = new LinkShelfRepository(new Memory(), () => current, () => `id-${++counter}`);
  const a = (await repository.parkTab({ title: 'Alpha', url: 'https://a.example/', pinnedBeforeParking: false })).link;
  const b = (await repository.parkTab({ title: 'Beta', url: 'https://b.example/', pinnedBeforeParking: false })).link;
  return { repository, a, b, setNow: (value: string) => { current = value; } };
}

describe('trash for removed links', () => {
  it('lists removed links newest first and recovers them to where they came from', async () => {
    const { repository, a, b, setNow } = await setup();
    await repository.archiveLink(b.id);
    await repository.removeLink(a.id);
    setNow('2026-08-02T12:00:00.000Z');
    await repository.removeLink(b.id);
    expect((await repository.getRemovedLinks()).map((link) => link.title)).toEqual(['Beta', 'Alpha']);

    expect(await repository.restoreRemovedLink(a.id)).toMatchObject({ status: 'parked' });
    expect(await repository.restoreRemovedLink(b.id)).toMatchObject({ status: 'archived' });
    expect((await repository.getLink(a.id))).not.toHaveProperty('removedAt');
    expect(await repository.getRemovedLinks()).toEqual([]);
    await expect(repository.restoreRemovedLink(a.id)).rejects.toBeInstanceOf(InvalidLinkStateError);
  });

  it('drops a stale reminder when recovering', async () => {
    const { repository, a, setNow } = await setup();
    setNow('2026-08-01T13:00:00.000Z');
    await repository.updateDatabase((database) => ({ ...database, links: database.links.map((link) => link.id === a.id ? { ...link, reminderAt: '2026-08-05T09:00:00.000Z' } : link) }));
    await repository.removeLink(a.id);
    expect(await repository.restoreRemovedLink(a.id)).not.toHaveProperty('reminderAt');
  });

  it('deletes chosen or all removed links permanently and never touches saved ones', async () => {
    const { repository, a, b } = await setup();
    await repository.removeLink(a.id);
    expect(await repository.deleteRemovedLinks([b.id])).toBe(0);
    expect(await repository.deleteRemovedLinks([a.id])).toBe(1);
    expect(await repository.getLink(a.id)).toBeUndefined();
    expect(await repository.getLink(b.id)).toMatchObject({ status: 'parked' });
    expect(await repository.deleteRemovedLinks()).toBe(0);
    await repository.removeLink(b.id);
    expect(await repository.deleteRemovedLinks()).toBe(1);
    expect((await repository.getDatabase()).links).toEqual([]);
    expect((await repository.getDatabase()).sessions).toEqual([]);
  });

  it('purges only links removed more than 30 days ago', async () => {
    const { repository, a, b, setNow } = await setup();
    await repository.removeLink(a.id);
    setNow('2026-08-20T12:00:00.000Z');
    await repository.removeLink(b.id);
    setNow('2026-08-31T12:00:00.000Z');
    expect(await repository.purgeExpiredRemovedLinks()).toBe(1);
    expect((await repository.getRemovedLinks()).map((link) => link.title)).toEqual(['Beta']);
    setNow('2026-09-19T12:00:00.000Z');
    expect(await repository.purgeExpiredRemovedLinks()).toBe(1);
    expect(await repository.getRemovedLinks()).toEqual([]);
  });

  it('keeps a session that still has other links', async () => {
    const { repository } = await setup();
    const { links, session } = await repository.parkTabs({ projectId: 'inbox', tabs: [
      { title: 'One', url: 'https://one.example/', pinnedBeforeParking: false },
      { title: 'Two', url: 'https://two.example/', pinnedBeforeParking: false },
    ] }).then((result) => ({ links: result.links, session: result.session }));
    await repository.removeLink(links[0].id);
    await repository.deleteRemovedLinks();
    expect((await repository.getDatabase()).sessions.some((candidate) => candidate.id === session.id)).toBe(true);
  });
});
