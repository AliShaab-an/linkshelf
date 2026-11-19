import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@/storage/storage-adapter';
import { SnapshotStore } from '@/storage/snapshot-store';
import { createSnapshotService } from './snapshot-service';

function setup(windows: Array<{ windowId: number; tabs: Array<{ url?: string; title?: string }> }>) {
  const values = new Map<string, unknown>();
  const storage: StorageAdapter = { get: async (key) => values.get(key), set: async (key, value) => { values.set(key, structuredClone(value)); } };
  let counter = 0;
  const current = { windows };
  const service = createSnapshotService({
    store: new SnapshotStore(storage, () => '2026-08-09T12:00:00.000Z', () => `id-${++counter}`),
    windows: { getAll: async () => current.windows },
    now: () => '2026-08-09T12:00:00.000Z',
    createId: () => `c-${++counter}`,
  });
  return { service, current, values };
}

const two = [
  { windowId: 1, tabs: [{ url: 'https://a.example/', title: 'A' }] },
  { windowId: 2, tabs: [{ url: 'https://b.example/', title: 'B' }, { url: 'https://c.example/', title: 'C' }] },
];

describe('snapshot service', () => {
  it('does nothing while the feature is off', async () => {
    const { service, values } = setup(two);
    await service.capture();
    await service.windowClosed(2);
    expect(values.size).toBe(0);
    expect(await service.summaries()).toEqual({ enabled: false, snapshots: [] });
  });

  it('captures when enabled, saves a closed window, and lists summaries', async () => {
    const { service } = setup(two);
    await service.setEnabled(true);
    await service.windowClosed(2);
    const { snapshots } = await service.summaries();
    expect(snapshots).toEqual([expect.objectContaining({ reason: 'window-closed', windowCount: 1, tabCount: 2 })]);
  });

  it('startup saves the previous session before capturing the new one', async () => {
    const { service, current } = setup(two);
    await service.setEnabled(true);
    current.windows = [{ windowId: 9, tabs: [{ url: 'https://new.example/', title: 'New' }] }];
    await service.started();
    const { snapshots } = await service.summaries();
    expect(snapshots).toEqual([expect.objectContaining({ reason: 'previous-session', tabCount: 3 })]);
  });

  it('never throws when capture fails', async () => {
    const { service, current } = setup(two);
    await service.setEnabled(true);
    current.windows = undefined as never;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(service.capture()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('restores every tab as a normal background tab and reports partial failures truthfully', async () => {
    const { service } = setup(two);
    await service.setEnabled(true);
    await service.windowClosed(2);
    const [{ id }] = (await service.summaries()).snapshots;
    let created = 0;
    const tabs = {
      create: vi.fn(async ({ url }: { url: string }) => { if (url.includes('c.example')) throw new Error('blocked'); return { id: ++created }; }),
    };
    const result = await service.restore(id, 7, tabs);
    expect(result).toEqual({ success: true, opened: 1, failed: 1, total: 2 });
    expect(tabs.create).toHaveBeenCalledWith({ url: 'https://b.example/', active: false, windowId: 7 });

    const all = { create: vi.fn(async () => ({ id: 5 })) };
    expect(await service.restore(id, 7, all)).toMatchObject({ success: true, opened: 2, failed: 0 });
  });

  it('reports a missing snapshot and a total failure without claiming success', async () => {
    const { service } = setup(two);
    await service.setEnabled(true);
    await service.windowClosed(2);
    const [{ id }] = (await service.summaries()).snapshots;
    expect(await service.restore('nope', 1, { create: vi.fn() })).toMatchObject({ success: false, error: { code: 'SNAPSHOT_NOT_FOUND' } });
    const failing = { create: vi.fn().mockRejectedValue(new Error('x')) };
    expect(await service.restore(id, 1, failing)).toMatchObject({ success: false, opened: 0, error: { code: 'TAB_OPEN_FAILED' } });
  });
});
