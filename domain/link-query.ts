import type { SavedLink } from './schemas';

/** Splits a typed filter into lower-case words; an empty result means "no filter". */
export function queryWords(query: string): string[] {
  return query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

/** True when every word appears in the link's title, address, note or tags, or in any extra text such as its project name. */
export function linkMatches(link: Pick<SavedLink, 'title' | 'url' | 'domain' | 'note' | 'tags'>, words: readonly string[], extra: readonly (string | undefined)[] = []): boolean {
  if (words.length === 0) return true;
  const text = [link.title, link.url, link.domain, link.note, ...(link.tags ?? []), ...extra].filter(Boolean).join(' ').toLocaleLowerCase();
  return words.every(word => text.includes(word));
}
