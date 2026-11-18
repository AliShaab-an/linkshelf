import type { ParkedSessionGroup } from '@/messaging/contracts';

export type SessionOrder = 'newest' | 'oldest' | 'title';
export const PROJECT_LINK_BATCH_SIZE = 25;

export function filterAndSortProjectGroups(
  groups: ParkedSessionGroup[],
  query: string,
  order: SessionOrder,
  tag?: string,
): ParkedSessionGroup[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = groups.map((group) => {
    if (tokens.length === 0 && !tag) return group;
    const sessionText = group.session.note?.toLocaleLowerCase() ?? '';
    const sessionMatches = tokens.every((token) => sessionText.includes(token));
    const links = (sessionMatches ? group.links : group.links.filter((link) => {
      const searchable = [link.title, link.url, link.domain, link.note ?? '', ...(link.tags ?? [])]
        .join('\n')
        .toLocaleLowerCase();
      return tokens.every((token) => searchable.includes(token));
    })).filter((link) => !tag || link.tags?.includes(tag));
    return { ...group, links };
  }).filter((group) => group.links.length > 0);

  return filtered.sort((first, second) => {
    if (order === 'title') return first.links[0].title.localeCompare(second.links[0].title, undefined, { sensitivity: 'base' });
    return order === 'newest'
      ? second.session.createdAt.localeCompare(first.session.createdAt)
      : first.session.createdAt.localeCompare(second.session.createdAt);
  });
}

/** Tag usage across the loaded groups, most used first. */
export function collectTagCounts(groups: ParkedSessionGroup[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    for (const link of group.links) {
      for (const tag of link.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts].map(([tag, count]) => ({ tag, count }))
    .sort((first, second) => second.count - first.count || first.tag.localeCompare(second.tag));
}

function localDay(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function groupSessionsByDay(groups: ParkedSessionGroup[], order: SessionOrder, now = new Date()) {
  const days = new Map<number, ParkedSessionGroup[]>();
  for (const group of groups) {
    const day = localDay(group.session.createdAt);
    const existing = days.get(day);
    if (existing) existing.push(group);
    else days.set(day, [group]);
  }
  const today = localDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return [...days.entries()].sort(([a], [b]) => order === 'oldest' ? a - b : b - a).map(([day, sessions]) => ({
    key: String(day),
    label: day === today ? 'Today' : day === yesterday.getTime() ? 'Yesterday' : new Date(day).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', ...(new Date(day).getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    }),
    sessions,
  }));
}

export function visibleProjectLinks(
  group: ParkedSessionGroup,
  limit: number = PROJECT_LINK_BATCH_SIZE,
) {
  return group.links.slice(0, Math.max(0, limit));
}

