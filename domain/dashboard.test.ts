import { describe, expect, it } from 'vitest';
import { describeAgo, describeWaiting, recentSessions, summarizeDashboard } from './dashboard';
import type { Project, SavedLink } from './schemas';

const at = '2026-01-01T00:00:00.000Z';
const project = (id: string, name: string): Project => ({ id, name, isInbox: false, createdAt: at, updatedAt: at });
const link = (id: string, projectId: string, createdAt = at) => ({ id, projectId, createdAt }) as SavedLink;

describe('summarizeDashboard', () => {
  it('counts links by state and ranks projects by waiting links', () => {
    const summary = summarizeDashboard({
      parked: [link('a', 'p1'), link('b', 'p2', '2025-12-01T00:00:00.000Z'), link('c', 'p2')],
      archived: [link('d', 'p1')],
      due: [link('a', 'p1')],
      projects: [project('p1', 'Reading'), project('p2', 'Trip'), project('p3', 'Empty')],
    });
    expect(summary).toMatchObject({ toReview: 3, dueReminders: 1, archived: 1, oldestWaitingSince: '2025-12-01T00:00:00.000Z' });
    expect(summary.projects.map(entry => [entry.project.name, entry.count])).toEqual([['Trip', 2], ['Reading', 1]]);
  });

  it('breaks ties by name and has no oldest date when nothing waits', () => {
    const tied = summarizeDashboard({ parked: [link('a', 'p2'), link('b', 'p1')], archived: [], due: [], projects: [project('p2', 'Zeta'), project('p1', 'Alpha')] });
    expect(tied.projects.map(entry => entry.project.name)).toEqual(['Alpha', 'Zeta']);
    const empty = summarizeDashboard({ parked: [], archived: [], due: [], projects: [project('p1', 'Alpha')] });
    expect(empty).toEqual({ toReview: 0, dueReminders: 0, archived: 0, projects: [] });
  });
});

describe('describeWaiting', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  it.each([
    ['2026-06-01T01:00:00.000Z', 'today'],
    ['2026-05-31T01:00:00.000Z', '1 day'],
    ['2026-05-20T00:00:00.000Z', '12 days'],
    ['2026-01-01T00:00:00.000Z', '5 months'],
    ['2024-01-01T00:00:00.000Z', '2 years'],
    ['2026-07-01T00:00:00.000Z', 'today'],
  ])('%s is %s', (since, expected) => expect(describeWaiting(since, now)).toBe(expected));
});

describe('describeAgo', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  it('reads naturally', () => {
    expect(describeAgo('2026-06-01T01:00:00.000Z', now)).toBe('today');
    expect(describeAgo('2026-05-29T01:00:00.000Z', now)).toBe('3 days ago');
  });
});

describe('recentSessions', () => {
  const group = (id: string, projectId: string, createdAt: string, titles: string[]) =>
    ({ session: { id, projectId, createdAt }, links: titles.map(title => ({ title })) });
  it('lists the newest sessions that still have links, with project names', () => {
    const result = recentSessions([
      group('old', 'p1', '2026-01-01T00:00:00.000Z', ['Old']),
      group('empty', 'p1', '2026-03-01T00:00:00.000Z', []),
      group('new', 'p2', '2026-02-01T00:00:00.000Z', ['First', 'Second']),
      group('lost', 'gone', '2026-01-15T00:00:00.000Z', ['Orphan']),
    ], [project('p1', 'Reading'), project('p2', 'Trip')], 3);
    expect(result.map(entry => [entry.id, entry.projectName, entry.linkCount, entry.firstTitle]))
      .toEqual([['new', 'Trip', 2, 'First'], ['lost', 'Unknown project', 1, 'Orphan'], ['old', 'Reading', 1, 'Old']]);
  });
  it('honours the limit', () => {
    const many = ['a', 'b', 'c', 'd'].map((id, index) => group(id, 'p1', `2026-01-0${index + 1}T00:00:00.000Z`, ['x']));
    expect(recentSessions(many, [project('p1', 'Reading')], 2).map(entry => entry.id)).toEqual(['d', 'c']);
  });
});
