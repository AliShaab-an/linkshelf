import {
  parseTabGroupColor, tabGroupKey, toOriginalTabGroup, type OriginalTabGroup,
} from '@/domain/tab-groups';

/** The slice of chrome.tabGroups this feature uses; absent until the optional permission is granted. */
export interface TabGroupsApi {
  get(groupId: number): Promise<{ title?: string; color?: string }>;
  query(info: { windowId: number; title?: string }): Promise<Array<{ id: number; title?: string; color?: string }>>;
  update(groupId: number, properties: { title?: string; color?: string }): Promise<unknown>;
}

export interface TabsGroupApi {
  group(options: { tabIds: number[]; groupId?: number; createProperties?: { windowId: number } }): Promise<number>;
}

export interface TabGroupPlacement {
  tabId: number;
  group: OriginalTabGroup;
}

export interface TabGroupRestoreOutcome {
  /** Groups Chrome could not create or fill. The tabs themselves stay open. */
  failedGroups: number;
}

/** Chrome reports ungrouped tabs with this id. */
const NO_GROUP = -1;

/**
 * Remembers and recreates Chrome tab groups. Every method is safe to call without the permission:
 * it then does nothing, and a failure never blocks parking or restoring.
 */
export function createTabGroups(dependencies: {
  granted(): Promise<boolean>;
  groups(): TabGroupsApi | undefined;
  tabs: TabsGroupApi;
}) {
  async function available() {
    try {
      if (!(await dependencies.granted())) return undefined;
    } catch { return undefined; }
    return dependencies.groups();
  }

  return {
    /** The group a tab belongs to, for saving with its link. */
    async describe(groupId: number | undefined): Promise<OriginalTabGroup | undefined> {
      if (groupId === undefined || groupId === NO_GROUP) return undefined;
      const groups = await available();
      if (!groups) return undefined;
      try {
        return toOriginalTabGroup(await groups.get(groupId));
      } catch { return undefined; }
    },

    /**
     * Puts restored tabs back in groups. Links from one group share a group again; a named group
     * that is already open in the window is reused so restoring links one at a time does not
     * scatter copies of it.
     */
    async restore(placements: readonly TabGroupPlacement[], windowId: number): Promise<TabGroupRestoreOutcome> {
      if (!placements.length) return { failedGroups: 0 };
      const groups = await available();
      if (!groups) return { failedGroups: 0 };

      const byGroup = new Map<string, { group: OriginalTabGroup; tabIds: number[] }>();
      for (const { tabId, group } of placements) {
        const key = tabGroupKey(group);
        const entry = byGroup.get(key) ?? { group, tabIds: [] };
        entry.tabIds.push(tabId);
        byGroup.set(key, entry);
      }

      let existing: Array<{ id: number; title?: string; color?: string }> = [];
      try { existing = await groups.query({ windowId }); } catch { /* Create new groups instead. */ }

      let failedGroups = 0;
      for (const { group, tabIds } of byGroup.values()) {
        try {
          const color = parseTabGroupColor(group.color);
          const reusable = group.title
            ? existing.find(candidate => candidate.title === group.title && (!color || candidate.color === color))
            : undefined;
          if (reusable) {
            await dependencies.tabs.group({ tabIds, groupId: reusable.id });
            continue;
          }
          const groupId = await dependencies.tabs.group({ tabIds, createProperties: { windowId } });
          await groups.update(groupId, { ...(group.title ? { title: group.title } : {}), ...(color ? { color } : {}) });
        } catch { failedGroups += 1; }
      }
      return { failedGroups };
    },
  };
}

export type TabGroups = ReturnType<typeof createTabGroups>;
