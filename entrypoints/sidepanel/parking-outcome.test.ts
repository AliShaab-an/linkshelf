import { describe, expect, it } from 'vitest';
import { parkingOutcome } from './parking-outcome';

describe('parking result', () => {
  it.each([[3, 0], [2, 1], [0, 3]])('preserves the returned counts and session for %i confirmed closures', (closed, failed) => {
    expect(parkingOutcome({
      success: true, saved: true, sessionId: 'returned-session',
      linkIds: ['a', 'b', 'c'],
      closedTabIds: [1, 2, 3].slice(0, closed),
      failedToCloseTabIds: [1, 2, 3].slice(closed),
    }, 'chosen-project')).toEqual({
      saved: 3, closed, unconfirmed: failed, skipped: 0,
      target: { sessionId: 'returned-session', projectId: 'chosen-project' },
    });
  });

  it('reports skipped duplicates and no session target when nothing was saved', () => {
    expect(parkingOutcome({
      success: true, saved: true, linkIds: [], skippedDuplicateTabIds: [1, 2],
      closedTabIds: [1, 2], failedToCloseTabIds: [],
    }, 'chosen-project')).toEqual({ saved: 0, closed: 2, unconfirmed: 0, skipped: 2, target: undefined });
  });
});
