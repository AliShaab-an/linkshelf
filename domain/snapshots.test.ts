import { describe, expect, it } from 'vitest';
import { MAX_SNAPSHOT_BYTES, MAX_TITLE_LENGTH, MAX_URL_LENGTH, SnapshotStoreSchema, buildSnapshot, snapshotSignature, summarizeSnapshot } from './snapshots';

const options = { id: 's1', capturedAt: '2026-08-09T12:00:00.000Z', reason: 'working' as const };

describe('buildSnapshot', () => {
  it('keeps only http(s) tabs and drops windows with nothing storable', () => {
    const snapshot = buildSnapshot([
      { windowId: 1, tabs: [{ url: 'https://a.example/', title: 'A' }, { url: 'chrome://settings', title: 'Settings' }, { url: 'chrome-extension://x/page.html' }, { title: 'No URL' }, { url: 'file:///C:/secret.txt' }, { url: 'javascript:alert(1)' }] },
      { windowId: 2, tabs: [{ url: 'about:blank' }] },
    ], options);
    expect(snapshot?.windows).toEqual([{ windowId: 1, tabs: [{ url: 'https://a.example/', title: 'A' }] }]);
    expect(snapshot?.truncated).toBe(false);
  });

  it('returns nothing when there is no storable tab', () => {
    expect(buildSnapshot([], options)).toBeUndefined();
    expect(buildSnapshot([{ tabs: [{ url: 'chrome://newtab' }] }], options)).toBeUndefined();
  });

  it('bounds titles, rejects oversized URLs and truncates past the size cap honestly', () => {
    const long = buildSnapshot([{ tabs: [{ url: 'https://a.example/', title: 'x'.repeat(5000) }, { url: `https://a.example/${'y'.repeat(MAX_URL_LENGTH)}` }] }], options)!;
    expect(long.windows[0].tabs).toHaveLength(1);
    expect(long.windows[0].tabs[0].title).toHaveLength(MAX_TITLE_LENGTH);

    const many = Array.from({ length: 5000 }, (_, index) => ({ url: `https://a.example/${index}`, title: 'T'.repeat(100) }));
    const capped = buildSnapshot([{ tabs: many }], options)!;
    expect(capped.truncated).toBe(true);
    expect(JSON.stringify(capped).length).toBeLessThan(MAX_SNAPSHOT_BYTES * 1.4);
    expect(SnapshotStoreSchema.safeParse({ version: 1, enabled: true, history: [capped] }).success).toBe(true);
  });

  it('summarizes and compares tab sets regardless of order, titles and grouping', () => {
    const first = buildSnapshot([{ tabs: [{ url: 'https://a.example/', title: 'A' }, { url: 'https://b.example/', title: 'B' }] }], options)!;
    const second = buildSnapshot([{ tabs: [{ url: 'https://b.example/', title: 'renamed' }] }, { tabs: [{ url: 'https://a.example/' }] }], options)!;
    expect(snapshotSignature(first)).toBe(snapshotSignature(second));
    expect(summarizeSnapshot(second)).toMatchObject({ windowCount: 2, tabCount: 2, truncated: false });
  });
});

describe('SnapshotStoreSchema', () => {
  it('rejects more than three saved snapshots and unknown fields', () => {
    const snapshot = buildSnapshot([{ tabs: [{ url: 'https://a.example/', title: 'A' }] }], options)!;
    expect(SnapshotStoreSchema.safeParse({ version: 1, enabled: true, history: [snapshot, snapshot, snapshot, snapshot] }).success).toBe(false);
    expect(SnapshotStoreSchema.safeParse({ version: 1, enabled: true, history: [], extra: 1 }).success).toBe(false);
  });
});
