export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS_PER_LINK = 10;

/** NFC, trimmed, whitespace collapsed to single spaces, lower-cased. */
export function normalizeTag(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

/** True for a tag already in canonical stored form. */
export function isValidTag(value: string): boolean {
  return value.length > 0 && value.length <= MAX_TAG_LENGTH &&
    value === normalizeTag(value) && !/[,\p{Cc}]/u.test(value);
}

export type TagsResult = { ok: true; tags: string[] } | { ok: false; message: string };

/**
 * Normalizes untrusted input into canonical stored tags: duplicates are merged in
 * order, and an empty list means "no tags". Nothing is silently dropped except
 * duplicates; invalid entries reject the whole list.
 */
export function parseTags(input: unknown): TagsResult {
  if (!Array.isArray(input) || input.some((value) => typeof value !== 'string')) {
    return { ok: false, message: 'Tags must be a list of text values.' };
  }
  const tags: string[] = [];
  for (const raw of input as string[]) {
    const tag = normalizeTag(raw);
    if (!tag) return { ok: false, message: 'Tags cannot be empty.' };
    if (tag.length > MAX_TAG_LENGTH) return { ok: false, message: `Tags can be at most ${MAX_TAG_LENGTH} characters.` };
    if (/[,\p{Cc}]/u.test(tag)) return { ok: false, message: 'Tags cannot contain commas or control characters.' };
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS_PER_LINK) return { ok: false, message: `A link can have at most ${MAX_TAGS_PER_LINK} tags.` };
  return { ok: true, tags };
}

export interface ParsedSearchQuery {
  /** Plain tokens, lower-cased, matched as substrings. */
  terms: string[];
  /** Exact tag filters from `tag:name` or `tag:"multi word"`, normalized. */
  tags: string[];
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const terms: string[] = [];
  const tags: string[] = [];
  for (const match of query.matchAll(/tag:"([^"]*)"|tag:(\S*)|\S+/giu)) {
    const quoted = match[1];
    const bare = match[2];
    if (quoted !== undefined || bare !== undefined) {
      const tag = normalizeTag(quoted ?? bare);
      // A bare "tag:" is still being typed and filters nothing yet.
      if (tag) tags.push(tag);
    } else {
      terms.push(match[0].toLocaleLowerCase());
    }
  }
  return { terms, tags };
}
