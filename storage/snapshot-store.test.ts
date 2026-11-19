import { describe, expect, it } from 'vitest';
import { SNAPSHOT_STORAGE_KEY, buildSnapshot } from '@/domain/snapshots';
import type { StorageAdapter } from './storage-adapter';
import { SnapshotStore } from './snapshot-store';

class Memory implements StorageAdapter {
  values = new Map<string, unknown>();
  failWrites = false;
  async get(key: string) { return this.values.get(key); }
  async set(key: string, value: unknown) {
    if (this.failWrites) throw new Error('quota');
    this.values.set(key, structuredClone(value));
  }
}

function setup() {
  const storage = new Memory();
  let counter = 0;
  const store = new SnapshotStore(storage, () => '2026-08-09T12:00:00.000Z', () => `id-${++counter}`);
  const working = (windows: Array<{ id: number; urls: string[] }>) => buildSnapshot(
    windows.map((window) => ({ windowId: window.id, tabs: window.urls.map((url) => ({ url, title: url })) })),
    { id: `w-${++counter}`, capturedAt: '2026-08-09T11:00:00.000Z', reason: 'working' },
  );
  return { storage, store, working };
}

describe('SnapshotStore', () => {
  it('is off and empty by default and ignores captures until enabled', async () => {
    const { store, working, storage } = setup();
    expect(await store.getState()).toEqual({ version: 1, enabled: false, history: [] });
    expect(await store.updateWorking(working([{ id: 1, urls: ['https://a.example/'] }]))).toBe(false);
    expect(storage.values.has(SNAPSHOT_STORAGE_KEY)).toBe(false);
  });

  it('cuts a closed window into history and keeps the remaining windows as the working copy', async () => {
    const { store, working } = setup();
    await store.setEnabled(true);
    await store.updateWorking(working([{ id: 1, urls: ['https://a.example/'] }, { id: 2, urls: ['https://b.example/', 'https://c.example/'] }]));
    expect(await store.commitClosedWindow(2)).toBe(true);
    const state = await store.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ reason: 'window-closed', windows: [{ tabs: [{ url: 'https://b.example/' }, { url: 'https://c.example/' }] }] });
    expect(state.working?.windows.map((window) => window.windowId)).toEqual([1]);
    expect(await store.commitClosedWindow(99)).toBe(false);
  });

  it('keeps only the last three, skips an identical newest entry, and never erases the working copy with an empty capture', async () => {
    const { store, working } = setup();
    await store.setEnabled(true);
    for (const site of ['a', 'b', 'c', 'd']) {
      await store.updateWorking(working([{ id: 1, urls: [`https://${site}.example/`] }]));
      await store.commitClosedWindow(1);
    }
    let state = await store.getState();
    expect(state.history.map((item) => item.windows[0].tabs[0].url)).toEqual(['https://d.example/', 'https://c.example/', 'https://b.example/']);

    await store.updateWorking(working([{ id: 1, urls: ['https://d.example/'] }]));
    expect(await store.commitClosedWindow(1)).toBe(false);

    await store.updateWorking(working([{ id: 3, urls: ['https://e.example/'] }]));
    await store.updateWorking(undefined);
    state = await store.getState();
    expect(state.working?.windows[0].tabs[0].url).toBe('https://e.example/');
  });

  it('saves the previous browser session at startup', async () => {
    const { store, working } = setup();
    await store.setEnabled(true);
    await store.updateWorking(working([{ id: 1, urls: ['https://a.example/'] }, { id: 2, urls: ['https://b.example/'] }]));
    expect(await store.commitPreviousSession()).toBe(true);
    const state = await store.getState();
    expect(state.history[0]).toMatchObject({ reason: 'previous-session' });
    expect(state.history[0].windows).toHaveLength(2);
    expect(state.working).toBeUndefined();
  });

  it('turning off deletes everything; clear keeps the opt-in', async () => {
    const { store, working } = setup();
    await store.setEnabled(true);
    await store.updateWorking(working([{ id: 1, urls: ['https://a.example/'] }]));
    await store.commitClosedWindow(1);
    expect(await store.clear()).toEqual({ version: 1, enabled: true, history: [] });
    await store.updateWorking(working([{ id: 1, urls: ['https://a.example/'] }]));
    expect(await store.setEnabled(false)).toEqual({ version: 1, enabled: false, history: [] });
  });

  it('treats an invalid stored value as empty and surfaces write failures to the caller', async () => {
    const { store, storage } = setup();
    storage.values.set(SNAPSHOT_STORAGE_KEY, { version: 9, nonsense: true });
    expect(await store.getState()).toEqual({ version: 1, enabled: false, history: [] });
    storage.failWrites = true;
    await expect(store.setEnabled(true)).rejects.toThrow('quota');
    storage.failWrites = false;
    expect((await store.setEnabled(true)).enabled).toBe(true);
  });

  it('serializes concurrent updates', async () => {
    const { store, working } = setup();
    await store.setEnabled(true);
    await Promise.all([1, 2, 3].map((id) => store.updateWorking(working([{ id, urls: [`https://${id}.example/`] }]))));
    expect((await store.getState()).working).toBeDefined();
  });
});
