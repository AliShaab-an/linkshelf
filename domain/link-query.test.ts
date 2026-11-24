import { describe, expect, it } from 'vitest';
import { linkMatches, queryWords } from './link-query';

const link = { title: 'Flights to Rome', url: 'https://air.example/r', domain: 'air.example', note: 'Window seat', tags: ['travel'] };

describe('link filters', () => {
  it('splits a query into lower-case words', () => {
    expect(queryWords('  Rome   TRIP ')).toEqual(['rome', 'trip']);
    expect(queryWords('   ')).toEqual([]);
  });

  it('needs every word somewhere in the link or the extra text', () => {
    expect(linkMatches(link, [])).toBe(true);
    expect(linkMatches(link, ['rome', 'window'])).toBe(true);
    expect(linkMatches(link, ['travel', 'air.example'])).toBe(true);
    expect(linkMatches(link, ['reading'], ['Reading list'])).toBe(true);
    expect(linkMatches(link, ['rome', 'paris'])).toBe(false);
    expect(linkMatches({ ...link, note: undefined, tags: undefined }, ['window'])).toBe(false);
  });
});
