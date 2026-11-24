import { describe, expect, it } from 'vitest';
import { extraCopies, findDuplicates } from './duplicates';
import type { SavedLink } from './schemas';

const link = (id: string, normalizedUrl: string, createdAt: string, status: SavedLink['status'] = 'parked') =>
  ({ id, normalizedUrl, createdAt, status }) as SavedLink;

describe('findDuplicates', () => {
  it('groups parked and archived links by address, biggest groups first, newest copy first', () => {
    const groups = findDuplicates([
      link('a1', 'https://a.example/', '2026-01-01'),
      link('a2', 'https://a.example/', '2026-03-01', 'archived'),
      link('b1', 'https://b.example/', '2026-02-01'),
      link('b2', 'https://b.example/', '2026-02-02'),
      link('b3', 'https://b.example/', '2026-01-05'),
      link('c1', 'https://c.example/', '2026-01-01'),
    ]);
    expect(groups.map(group => group.links.map(item => item.id))).toEqual([['b2', 'b1', 'b3'], ['a2', 'a1']]);
  });

  it('ignores removed and restored links, and single copies', () => {
    expect(findDuplicates([
      link('a1', 'https://a.example/', '2026-01-01'),
      link('a2', 'https://a.example/', '2026-01-02', 'removed'),
      link('a3', 'https://a.example/', '2026-01-03', 'restored'),
    ])).toEqual([]);
  });

  it('breaks ties between equal groups by the most recent copy', () => {
    const groups = findDuplicates([
      link('a1', 'https://a.example/', '2026-01-01'), link('a2', 'https://a.example/', '2026-01-02'),
      link('b1', 'https://b.example/', '2026-05-01'), link('b2', 'https://b.example/', '2026-01-02'),
    ]);
    expect(groups.map(group => group.normalizedUrl)).toEqual(['https://b.example/', 'https://a.example/']);
  });
});

describe('extraCopies', () => {
  it('is every copy except the kept one', () => {
    const [group] = findDuplicates([link('a1', 'u:a', '2026-01-01'), link('a2', 'u:a', '2026-01-02'), link('a3', 'u:a', '2026-01-03')]);
    expect(extraCopies(group, 'a2').map(item => item.id)).toEqual(['a3', 'a1']);
  });
});
