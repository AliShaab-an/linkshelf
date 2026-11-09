import type { ParkedSessionGroup } from '@/messaging/contracts';

export type SessionOrder = 'newest' | 'oldest';
export const PROJECT_LINK_BATCH_SIZE = 25;

export function filterAndSortProjectGroups(
  groups: ParkedSessionGroup[],
  query: string,
  order: SessionOrder,
): ParkedSessionGroup[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = groups.map((group) => {
    if (tokens.length === 0) return group;
    const sessionText = group.session.note?.toLocaleLowerCase() ?? '';
    const sessionMatches = tokens.every((token) => sessionText.includes(token));
    const links = sessionMatches ? group.links : group.links.filter((link) => {
      const searchable = [link.title, link.url, link.domain, link.note ?? '']
        .join('\n')
        .toLocaleLowerCase();
      return tokens.every((token) => searchable.includes(token));
    });
    return { ...group, links };
  }).filter((group) => group.links.length > 0);

  return [...filtered].sort((first, second) => order === 'newest'
    ? second.session.createdAt.localeCompare(first.session.createdAt)
    : first.session.createdAt.localeCompare(second.session.createdAt));
}

export function visibleProjectLinks(
  group: ParkedSessionGroup,
  limit: number = PROJECT_LINK_BATCH_SIZE,
) {
  return group.links.slice(0, Math.max(0, limit));
}

