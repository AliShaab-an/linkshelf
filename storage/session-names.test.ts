import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from './storage-adapter';
import { InvalidSessionNameError, LinkShelfRepository, SessionNotFoundError } from './repository';
import { SESSION_NAME_MAX_LENGTH } from '@/domain/schemas';
import { isParkSelectedTabsMessage, isRenameSessionMessage } from '@/messaging/contracts';

class MemoryStorageAdapter implements StorageAdapter {
  readonly values = new Map<string, unknown>();
  async get(key: string): Promise<unknown> { return this.values.get(key); }
  async set(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
}

function repositoryAt(clock: { now: string } = { now: '2026-08-09T12:00:00.000Z' }) {
  let counter = 0;
  return new LinkShelfRepository(new MemoryStorageAdapter(), () => clock.now, () => `id-${++counter}`);
}

const tabs = [
  { title: 'A', url: 'https://a.example.com/', pinnedBeforeParking: false },
  { title: 'B', url: 'https://b.example.com/', pinnedBeforeParking: false },
];

describe('session names', () => {
  it('saves a trimmed name with a new session and nothing when it is blank or missing', async () => {
    const repository = repositoryAt();
    const named = await repository.parkTabs({ name: '  Trip   planning ', tabs });
    expect(named.session.name).toBe('Trip planning');
    const blank = await repository.parkTabs({ name: '   ', tabs });
    expect('name' in blank.session).toBe(false);
    const missing = await repository.parkTabs({ tabs });
    expect('name' in missing.session).toBe(false);
  });

  it('refuses a name that is too long instead of cutting it short, and stores nothing', async () => {
    const repository = repositoryAt();
    await expect(repository.parkTabs({ name: 'x'.repeat(SESSION_NAME_MAX_LENGTH + 1), tabs })).rejects.toBeInstanceOf(InvalidSessionNameError);
    expect((await repository.getDatabase()).sessions).toHaveLength(0);
    expect((await repository.parkTabs({ name: 'x'.repeat(SESSION_NAME_MAX_LENGTH), tabs })).session.name).toHaveLength(SESSION_NAME_MAX_LENGTH);
  });

  it('renames and clears a name, updating the session time only when something changed', async () => {
    const clock = { now: '2026-08-09T12:00:00.000Z' };
    const repository = repositoryAt(clock);
    const { session } = await repository.parkTabs({ tabs });
    clock.now = '2026-08-10T12:00:00.000Z';
    const renamed = await repository.renameSession(session.id, ' Reading list ');
    expect(renamed.name).toBe('Reading list');
    expect(renamed.updatedAt).not.toBe(session.updatedAt);
    expect((await repository.getDatabase()).sessions[0].name).toBe('Reading list');

    clock.now = '2026-08-11T12:00:00.000Z';
    const same = await repository.renameSession(session.id, 'Reading list');
    expect(same.updatedAt).toBe(renamed.updatedAt);

    const cleared = await repository.renameSession(session.id, null);
    expect('name' in cleared).toBe(false);
    expect('name' in (await repository.getDatabase()).sessions[0]).toBe(false);
    expect('name' in await repository.renameSession(session.id, '   ')).toBe(false);
  });

  it('rejects unknown sessions, long names and non-text names without changing anything', async () => {
    const repository = repositoryAt();
    const { session } = await repository.parkTabs({ name: 'Keep me', tabs });
    await expect(repository.renameSession('missing', 'x')).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(repository.renameSession(session.id, 'x'.repeat(SESSION_NAME_MAX_LENGTH + 1))).rejects.toBeInstanceOf(InvalidSessionNameError);
    await expect(repository.renameSession(session.id, 42)).rejects.toBeInstanceOf(InvalidSessionNameError);
    expect((await repository.getDatabase()).sessions[0].name).toBe('Keep me');
  });
});

describe('session name messages', () => {
  it('accepts a text or cleared name and rejects anything else', () => {
    expect(isRenameSessionMessage({ type: 'RENAME_SESSION', payload: { sessionId: 's', name: 'A' } })).toBe(true);
    expect(isRenameSessionMessage({ type: 'RENAME_SESSION', payload: { sessionId: 's', name: null } })).toBe(true);
    expect(isRenameSessionMessage({ type: 'RENAME_SESSION', payload: { sessionId: 's' } })).toBe(false);
    expect(isRenameSessionMessage({ type: 'RENAME_SESSION', payload: { sessionId: '', name: 'A' } })).toBe(false);
    expect(isRenameSessionMessage({ type: 'RENAME_SESSION', payload: { sessionId: 's', name: 3 } })).toBe(false);
  });

  it('lets selected tabs be parked with an optional text name only', () => {
    const base = { type: 'PARK_SELECTED_TABS', payload: { tabIds: [1, 2], projectId: 'p' } };
    expect(isParkSelectedTabsMessage(base)).toBe(true);
    expect(isParkSelectedTabsMessage({ ...base, payload: { ...base.payload, name: 'Trip' } })).toBe(true);
    expect(isParkSelectedTabsMessage({ ...base, payload: { ...base.payload, name: 5 } })).toBe(false);
  });
});
