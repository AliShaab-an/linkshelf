import { describe, expect, it } from 'vitest';
import { buildLibrary, moveInLibrary } from './library';
import type { Project, SavedLink } from './schemas';

const at = '2026-01-01T00:00:00.000Z';
const project = (id: string, name: string, isInbox = false): Project => ({ id, name, isInbox, createdAt: at, updatedAt: at });
const link = (id: string, projectId: string) => ({ id, projectId, title: id }) as SavedLink;
const session = (projectId: string, createdAt: string, name?: string) => ({ projectId, createdAt, ...(name ? { name } : {}) });

describe('buildLibrary', () => {
  it('puts the Inbox first, sorts the rest by name, and keeps empty projects as cards', () => {
    const cards = buildLibrary([project('z', 'Zeta'), project('inbox', 'Inbox', true), project('a', 'Alpha')], []);
    expect(cards.map(card => card.project.name)).toEqual(['Inbox', 'Alpha', 'Zeta']);
    expect(cards.every(card => card.links.length === 0)).toBe(true);
  });

  it('lists newer sessions first and carries the session name', () => {
    const [card] = buildLibrary([project('p', 'P')], [
      { session: session('p', '2026-01-01T00:00:00.000Z'), links: [link('old', 'p')] },
      { session: session('p', '2026-02-01T00:00:00.000Z', 'Trip'), links: [link('n1', 'p'), link('n2', 'p')] },
    ]);
    expect(card.links.map(entry => entry.link.id)).toEqual(['n1', 'n2', 'old']);
    expect(card.links.map(entry => entry.sessionName)).toEqual(['Trip', 'Trip', undefined]);
  });
});

describe('moveInLibrary', () => {
  const cards = buildLibrary([project('a', 'A'), project('b', 'B')], [{ session: session('a', at), links: [link('x', 'a'), link('y', 'a')] }]);

  it('moves a link to the front of the destination without changing the original', () => {
    const moved = moveInLibrary(cards, 'x', 'b');
    expect(moved.find(card => card.project.id === 'a')?.links.map(entry => entry.link.id)).toEqual(['y']);
    expect(moved.find(card => card.project.id === 'b')?.links.map(entry => [entry.link.id, entry.link.projectId])).toEqual([['x', 'b']]);
    expect(cards.find(card => card.project.id === 'a')?.links).toHaveLength(2);
  });

  it('ignores unknown links and moves into the same project', () => {
    expect(moveInLibrary(cards, 'nope', 'b')).toEqual(cards);
    expect(moveInLibrary(cards, 'x', 'a')).toEqual(cards);
  });
});
