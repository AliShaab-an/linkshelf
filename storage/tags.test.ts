import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from './storage-adapter';
import {
  DATABASE_STORAGE_KEY,
  InvalidLinkStateError,
  InvalidTagsError,
  LinkNotFoundError,
  LinkShelfRepository,
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
    if (this.writeCount === this.failOnWrite) throw new Error('simulated write failure');
    this.values.set(key, structuredClone(value));
  }
}

async function tagged() {
  const storage = new MemoryStorageAdapter();
  let counter = 0;
  const repository = new LinkShelfRepository(storage, () => now, () => `id-${++counter}`);
  const first = await repository.parkTab({ title: 'Alpha page', url: 'https://a.example.com/', pinnedBeforeParking: false });
  const second = await repository.parkTab({ title: 'Beta page', url: 'https://b.example.com/', pinnedBeforeParking: false });
  return { storage, repository, first: first.link, second: second.link };
}

describe('link tags in the repository', () => {
  it('normalizes, persists and clears tags', async () => {
    const { repository, storage, first } = await tagged();
    expect((await repository.setLinkTags(first.id, [' Work ', 'work', 'Read  Later'])).tags).toEqual(['work', 'read later']);
    expect((await repository.getLink(first.id))?.tags).toEqual(['work', 'read later']);
    const stored = storage.values.get(DATABASE_STORAGE_KEY) as { links: Array<{ tags?: string[] }> };
    expect(stored.links[0].tags).toEqual(['work', 'read later']);

    expect((await repository.setLinkTags(first.id, [])).tags).toBeUndefined();
    expect('tags' in (await repository.getLink(first.id))!).toBe(false);
  });

  it('rejects invalid tags and non-taggable links without changing stored data', async () => {
    const { repository, storage, first } = await tagged();
    await repository.setLinkTags(first.id, ['keep']);
    const before = structuredClone(storage.values.get(DATABASE_STORAGE_KEY));
    const writes = storage.writeCount;
    await expect(repository.setLinkTags(first.id, ['a,b'])).rejects.toBeInstanceOf(InvalidTagsError);
    await expect(repository.setLinkTags(first.id, 'not-a-list')).rejects.toBeInstanceOf(InvalidTagsError);
    await expect(repository.setLinkTags('missing', ['x'])).rejects.toBeInstanceOf(LinkNotFoundError);
    expect(storage.values.get(DATABASE_STORAGE_KEY)).toEqual(before);
    expect(storage.writeCount).toBe(writes);

    await repository.removeLink(first.id);
    const afterRemove = structuredClone(storage.values.get(DATABASE_STORAGE_KEY));
    await expect(repository.setLinkTags(first.id, ['x'])).rejects.toBeInstanceOf(InvalidLinkStateError);
    expect(storage.values.get(DATABASE_STORAGE_KEY)).toEqual(afterRemove);
  });

  it('rolls back a failed tag write', async () => {
    const { repository, storage, first } = await tagged();
    const before = structuredClone(storage.values.get(DATABASE_STORAGE_KEY));
    storage.failOnWrite = storage.writeCount + 1;
    await expect(repository.setLinkTags(first.id, ['x'])).rejects.toThrow();
    expect(storage.values.get(DATABASE_STORAGE_KEY)).toEqual(before);
  });

  it('matches tags in search, supports exact tag filters, and counts usage', async () => {
    const { repository, first, second } = await tagged();
    await repository.setLinkTags(first.id, ['work', 'read later']);
    await repository.setLinkTags(second.id, ['work', 'workshop']);
    const ids = async (query: string) => (await repository.searchLinks(query)).map((result) => result.link.id).sort();
    expect(await ids('workshop')).toEqual([second.id]);
    expect(await ids('tag:work')).toEqual([first.id, second.id].sort());
    expect(await ids('tag:workshop')).toEqual([second.id]);
    expect(await ids('tag:"read later"')).toEqual([first.id]);
    expect(await ids('tag:work alpha')).toEqual([first.id]);
    expect(await ids('tag:missing')).toEqual([]);
    expect(await ids('tag:')).toEqual([]);
    expect(await repository.getTagCounts()).toEqual([
      { tag: 'work', count: 2 }, { tag: 'read later', count: 1 }, { tag: 'workshop', count: 1 },
    ]);
    await repository.removeLink(second.id);
    expect(await repository.getTagCounts()).toEqual([{ tag: 'read later', count: 1 }, { tag: 'work', count: 1 }]);
  });

  it('exports tags in a current backup and restores them through replace and merge', async () => {
    const { repository, first } = await tagged();
    await repository.setLinkTags(first.id, ['work']);
    const backup = await repository.exportBackup();
    expect(backup.schemaVersion).toBe(3);
    expect(backup.database.links.find((link) => link.id === first.id)?.tags).toEqual(['work']);

    for (const mode of ['replace', 'merge'] as const) {
      const target = new LinkShelfRepository(new MemoryStorageAdapter(), () => now);
      await target.initialize();
      const preview = await target.previewImportBackup(backup, mode);
      await target.importBackup(backup, mode, preview.revisionToken);
      expect((await target.getLink(first.id))?.tags).toEqual(['work']);
    }
  });

  it('does not rewrite tags of existing links during a merge import', async () => {
    const { repository, first } = await tagged();
    await repository.setLinkTags(first.id, ['old']);
    const backup = await repository.exportBackup();
    await repository.setLinkTags(first.id, ['new']);
    const preview = await repository.previewImportBackup(backup, 'merge');
    await repository.importBackup(backup, 'merge', preview.revisionToken);
    expect((await repository.getLink(first.id))?.tags).toEqual(['new']);
  });
});
