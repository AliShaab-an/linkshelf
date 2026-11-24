import type { z } from 'zod';
import type { OriginalTabGroupSchema } from './schemas';

export type OriginalTabGroup = z.infer<typeof OriginalTabGroupSchema>;

/**
 * Optional permission: keeping tab groups is a choice the person makes in Settings, so the
 * extension never needs it to install, update, park, or restore.
 */
export const TAB_GROUPS_PERMISSION = 'tabGroups' as const;

/** The colours Chrome accepts for a tab group. */
export const TAB_GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;
export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export function parseTabGroupColor(value: unknown): TabGroupColor | undefined {
  return TAB_GROUP_COLORS.find(color => color === value);
}

/** Builds the stored form of a Chrome tab group, or undefined when it has nothing worth keeping. */
export function toOriginalTabGroup(group: { title?: string; color?: string }): OriginalTabGroup | undefined {
  const title = group.title?.trim() || undefined;
  const color = parseTabGroupColor(group.color);
  return title || color ? { ...(title ? { title } : {}), ...(color ? { color } : {}) } : undefined;
}

/** Links saved from the same group share a title and colour, which is all that is stored. */
export function tabGroupKey(group: OriginalTabGroup): string {
  return `${group.title ?? ''}\u0000${group.color ?? ''}`;
}
