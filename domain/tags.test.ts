import { describe, expect, it } from 'vitest';
import { LinkShelfBackupSchema, SavedLinkSchema, TagsSchema } from './schemas';
import { createEmptyDatabase } from './defaults';
import { formatTagFilter, isValidTag, MAX_TAG_LENGTH, MAX_TAGS_PER_LINK, normalizeTag, parseSearchQuery, parseTags, toggleTagInQuery } from './tags';

describe('tag normalization', () => {
  it('trims, collapses whitespace, applies NFC and lower-cases', () => {
    expect(normalizeTag('  Read   Later\t')).toBe('read later');
    expect(normalizeTag('Café')).toBe('café');
    expect(normalizeTag('TÜRKÇE')).toBe('türkçe'.toLocaleLowerCase());
  });

  it('accepts only canonical tags', () => {
    expect(isValidTag('read later')).toBe(true);
    for (const bad of ['', 'Upper', ' lead', 'a  b', 'a,b', 'a\u0007b', 'x'.repeat(MAX_TAG_LENGTH + 1)]) {
      expect(isValidTag(bad)).toBe(false);
    }
    expect(isValidTag('x'.repeat(MAX_TAG_LENGTH))).toBe(true);
  });
});

describe('parseTags', () => {
  it('normalizes and merges duplicates in order', () => {
    expect(parseTags([' Work ', 'work', 'Ideas'])).toEqual({ ok: true, tags: ['work', 'ideas'] });
    expect(parseTags([])).toEqual({ ok: true, tags: [] });
  });

  it.each([
    ['non-array', 'work'],
    ['non-string entry', ['ok', 3]],
    ['empty tag', ['ok', '   ']],
    ['too long', ['x'.repeat(MAX_TAG_LENGTH + 1)]],
    ['comma', ['a,b']],
    ['control character', ['a\u0000b']],
    ['too many', Array.from({ length: MAX_TAGS_PER_LINK + 1 }, (_, index) => `tag${index}`)],
  ])('rejects %s without partial results', (_name, value) => {
    expect(parseTags(value).ok).toBe(false);
  });

  it('allows exactly the maximum number of tags', () => {
    const tags = Array.from({ length: MAX_TAGS_PER_LINK }, (_, index) => `tag${index}`);
    expect(parseTags(tags)).toEqual({ ok: true, tags });
  });
});

describe('parseSearchQuery', () => {
  it('splits plain terms from exact tag filters', () => {
    expect(parseSearchQuery('React  tag:Work tag:"read later" Guide')).toEqual({
      terms: ['react', 'guide'],
      tags: ['work', 'read later'],
    });
  });

  it('ignores a bare tag: prefix that is still being typed', () => {
    expect(parseSearchQuery('tag:')).toEqual({ terms: [], tags: [] });
    expect(parseSearchQuery('tag:"')).toEqual({ terms: [], tags: ['"'] });
  });
});

describe('tags in the schema', () => {
  const link = {
    id: 'l', sessionId: 's', projectId: 'inbox', title: 't', url: 'https://example.com/', normalizedUrl: 'https://example.com/',
    domain: 'example.com', status: 'parked', pinnedBeforeParking: false,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  };

  it('accepts links without tags and with canonical tags', () => {
    expect(SavedLinkSchema.safeParse(link).success).toBe(true);
    expect(SavedLinkSchema.safeParse({ ...link, tags: ['a', 'b c'] }).success).toBe(true);
  });

  it.each([[[]], [['A']], [['a', 'a']], [['a,b']], [Array.from({ length: 11 }, (_, i) => `t${i}`)]])('rejects non-canonical tags %j', (tags) => {
    expect(TagsSchema.safeParse(tags).success).toBe(false);
    expect(SavedLinkSchema.safeParse({ ...link, tags }).success).toBe(false);
  });

  it('round-trips tags through a current backup', () => {
    const database = createEmptyDatabase('2026-11-01T00:00:00.000Z');
    database.sessions.push({ id: 's', projectId: 'inbox', createdAt: link.createdAt, updatedAt: link.updatedAt });
    database.links.push({ ...link, status: 'parked', tags: ['work'] });
    const backup = LinkShelfBackupSchema.parse({ format: 'linkshelf-backup', schemaVersion: 3, exportedAt: link.createdAt, database });
    expect(JSON.parse(JSON.stringify(backup)).database.links[0].tags).toEqual(['work']);
  });
});

describe('tag filters in a query', () => {
  it('formats tag filters, quoting tags with spaces', () => {
    expect(formatTagFilter('work')).toBe('tag:work');
    expect(formatTagFilter('read later')).toBe('tag:"read later"');
  });

  it('adds a missing tag filter and keeps what the user typed', () => {
    expect(toggleTagInQuery('React Guide', 'Work')).toBe('React Guide tag:work');
    expect(toggleTagInQuery('', 'read later')).toBe('tag:"read later"');
  });

  it('removes an existing filter in either form and leaves other tokens alone', () => {
    expect(toggleTagInQuery('React tag:work tag:"read later"', 'work')).toBe('React tag:"read later"');
    expect(toggleTagInQuery('React tag:work tag:"read later"', 'Read  Later')).toBe('React tag:work');
    expect(toggleTagInQuery('tag:work', 'work')).toBe('');
  });

  it('round-trips through the search parser', () => {
    const query = toggleTagInQuery(toggleTagInQuery('guide', 'a b'), 'c');
    expect(parseSearchQuery(query)).toEqual({ terms: ['guide'], tags: ['a b', 'c'] });
  });
});
