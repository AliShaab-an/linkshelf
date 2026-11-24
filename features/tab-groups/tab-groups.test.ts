import { describe, expect, it, vi } from 'vitest';
import { createTabGroups, type TabGroupsApi } from './tab-groups';
import { tabGroupKey, toOriginalTabGroup } from '@/domain/tab-groups';

function fixture({ granted = true, existing = [] as Array<{ id: number; title?: string; color?: string }> } = {}) {
  let nextGroup = 100;
  const api: TabGroupsApi = {
    get: vi.fn(async (id: number) => ({ title: ` Research ${id} `, color: 'blue' })),
    query: vi.fn(async () => existing),
    update: vi.fn(async () => undefined),
  };
  const tabs = { group: vi.fn(async (options: { groupId?: number }) => options.groupId ?? nextGroup++) };
  const groups = createTabGroups({ granted: async () => granted, groups: () => api, tabs });
  return { api, tabs, groups };
}

describe('tab group values', () => {
  it('keeps a trimmed title and only a colour Chrome accepts', () => {
    expect(toOriginalTabGroup({ title: '  Trip ', color: 'teal' })).toEqual({ title: 'Trip' });
    expect(toOriginalTabGroup({ color: 'cyan' })).toEqual({ color: 'cyan' });
    expect(toOriginalTabGroup({ title: ' ', color: 'nope' })).toBeUndefined();
  });

  it('treats the same title and colour as one group', () => {
    expect(tabGroupKey({ title: 'A', color: 'red' })).toBe(tabGroupKey({ title: 'A', color: 'red' }));
    expect(tabGroupKey({ title: 'A', color: 'red' })).not.toBe(tabGroupKey({ title: 'A', color: 'blue' }));
    expect(tabGroupKey({ title: 'A' })).not.toBe(tabGroupKey({ color: 'A' }));
  });
});

describe('describing a tab group when parking', () => {
  it('returns the title and colour of a grouped tab', async () => {
    const { groups, api } = fixture();
    expect(await groups.describe(7)).toEqual({ title: 'Research 7', color: 'blue' });
    expect(api.get).toHaveBeenCalledWith(7);
  });

  it.each([undefined, -1])('ignores a tab with no group (%s)', async (groupId) => {
    const { groups, api } = fixture();
    expect(await groups.describe(groupId)).toBeUndefined();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('does nothing without the permission', async () => {
    const { groups, api } = fixture({ granted: false });
    expect(await groups.describe(7)).toBeUndefined();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('never throws when Chrome cannot read the group or the permission check fails', async () => {
    const { groups, api } = fixture();
    vi.mocked(api.get).mockRejectedValueOnce(new Error('group closed'));
    expect(await groups.describe(7)).toBeUndefined();
    const unreadable = createTabGroups({ granted: async () => { throw new Error('no permissions API'); }, groups: () => api, tabs: { group: vi.fn() } });
    expect(await unreadable.describe(7)).toBeUndefined();
  });

  it('does nothing when the API is not available yet', async () => {
    const groups = createTabGroups({ granted: async () => true, groups: () => undefined, tabs: { group: vi.fn() } });
    expect(await groups.describe(7)).toBeUndefined();
    expect(await groups.restore([{ tabId: 1, group: { title: 'A' } }], 3)).toEqual({ failedGroups: 0 });
  });
});

describe('restoring tab groups', () => {
  it('puts tabs from one group back together with their title and colour', async () => {
    const { groups, tabs, api } = fixture();
    const outcome = await groups.restore([
      { tabId: 1, group: { title: 'Trip', color: 'red' } },
      { tabId: 2, group: { title: 'Trip', color: 'red' } },
      { tabId: 3, group: { title: 'Work', color: 'blue' } },
    ], 9);
    expect(outcome).toEqual({ failedGroups: 0 });
    expect(tabs.group).toHaveBeenNthCalledWith(1, { tabIds: [1, 2], createProperties: { windowId: 9 } });
    expect(tabs.group).toHaveBeenNthCalledWith(2, { tabIds: [3], createProperties: { windowId: 9 } });
    expect(api.update).toHaveBeenCalledWith(100, { title: 'Trip', color: 'red' });
    expect(api.update).toHaveBeenCalledWith(101, { title: 'Work', color: 'blue' });
  });

  it('joins a named group that is already open in the window', async () => {
    const { groups, tabs, api } = fixture({ existing: [{ id: 55, title: 'Trip', color: 'red' }] });
    await groups.restore([{ tabId: 4, group: { title: 'Trip', color: 'red' } }], 9);
    expect(tabs.group).toHaveBeenCalledWith({ tabIds: [4], groupId: 55 });
    expect(api.update).not.toHaveBeenCalled();
  });

  it('does not join a group with another colour or an unnamed group', async () => {
    const { groups, tabs } = fixture({ existing: [{ id: 55, title: 'Trip', color: 'blue' }, { id: 56, color: 'green' }] });
    await groups.restore([
      { tabId: 4, group: { title: 'Trip', color: 'red' } },
      { tabId: 5, group: { color: 'green' } },
    ], 9);
    expect(tabs.group).toHaveBeenCalledTimes(2);
    expect(tabs.group).toHaveBeenNthCalledWith(1, { tabIds: [4], createProperties: { windowId: 9 } });
    expect(tabs.group).toHaveBeenNthCalledWith(2, { tabIds: [5], createProperties: { windowId: 9 } });
  });

  it('reports groups Chrome could not make and still handles the others', async () => {
    const { groups, tabs } = fixture();
    tabs.group.mockRejectedValueOnce(new Error('tab closed'));
    const outcome = await groups.restore([
      { tabId: 1, group: { title: 'A' } },
      { tabId: 2, group: { title: 'B' } },
    ], 9);
    expect(outcome).toEqual({ failedGroups: 1 });
    expect(tabs.group).toHaveBeenCalledTimes(2);
  });

  it('still creates groups when listing the window groups fails', async () => {
    const { groups, tabs, api } = fixture();
    vi.mocked(api.query).mockRejectedValueOnce(new Error('window gone'));
    expect(await groups.restore([{ tabId: 1, group: { title: 'A' } }], 9)).toEqual({ failedGroups: 0 });
    expect(tabs.group).toHaveBeenCalledWith({ tabIds: [1], createProperties: { windowId: 9 } });
  });

  it('does nothing without the permission', async () => {
    const { groups, tabs } = fixture({ granted: false });
    expect(await groups.restore([{ tabId: 1, group: { title: 'A' } }], 9)).toEqual({ failedGroups: 0 });
    expect(tabs.group).not.toHaveBeenCalled();
  });
});
