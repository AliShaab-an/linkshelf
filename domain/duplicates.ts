import type { SavedLink } from './schemas';

export interface DuplicateGroup {
  normalizedUrl: string;
  /** Every saved copy of the address, newest first. */
  links: SavedLink[];
}

/**
 * Parked and archived links that share an address once tracking parameters and other noise are
 * stripped. Groups with the most copies come first; ties go to the most recently saved.
 */
export function findDuplicates(links: readonly SavedLink[]): DuplicateGroup[] {
  const byUrl = new Map<string, SavedLink[]>();
  for (const link of links) {
    if (link.status !== 'parked' && link.status !== 'archived') continue;
    const group = byUrl.get(link.normalizedUrl) ?? [];
    group.push(link);
    byUrl.set(link.normalizedUrl, group);
  }
  return [...byUrl.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([normalizedUrl, group]) => ({ normalizedUrl, links: [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }))
    .sort((a, b) => b.links.length - a.links.length || b.links[0].createdAt.localeCompare(a.links[0].createdAt));
}

/** The copies to remove when keeping one: everything in the group except the kept link. */
export function extraCopies(group: DuplicateGroup, keepId: string): SavedLink[] {
  return group.links.filter(link => link.id !== keepId);
}
