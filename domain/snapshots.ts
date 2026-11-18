import { z } from 'zod';
import { isEligibleUrl } from './url';

/** Separate from the main database and from JSON backups. */
export const SNAPSHOT_STORAGE_KEY = 'linkshelfSnapshots';
export const SNAPSHOT_ALARM_NAME = 'linkshelf-snapshot';
export const SNAPSHOT_ALARM_PERIOD_MINUTES = 5;

export const MAX_SNAPSHOTS = 3;
export const MAX_URL_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 200;
/** Estimated serialized size per snapshot; four snapshots (three saved plus the working copy) stay under ~800 KB. */
export const MAX_SNAPSHOT_BYTES = 200_000;

const SnapshotTabSchema = z.strictObject({
  url: z.url().max(MAX_URL_LENGTH),
  title: z.string().max(MAX_TITLE_LENGTH),
});

const SnapshotWindowSchema = z.strictObject({
  windowId: z.number().int().optional(),
  tabs: z.array(SnapshotTabSchema).min(1),
});

export const SnapshotReasonSchema = z.enum(['working', 'window-closed', 'previous-session']);
export type SnapshotReason = z.infer<typeof SnapshotReasonSchema>;

export const SnapshotSchema = z.strictObject({
  id: z.string().min(1),
  capturedAt: z.iso.datetime(),
  reason: SnapshotReasonSchema,
  windows: z.array(SnapshotWindowSchema).min(1),
  truncated: z.boolean(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const SnapshotStoreSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.boolean(),
  /** The continuously refreshed copy that saved snapshots are cut from. */
  working: SnapshotSchema.optional(),
  history: z.array(SnapshotSchema).max(MAX_SNAPSHOTS),
});
export type SnapshotStoreData = z.infer<typeof SnapshotStoreSchema>;

export function emptySnapshotStore(enabled = false): SnapshotStoreData {
  return { version: 1, enabled, history: [] };
}

export interface SnapshotSummary {
  id: string;
  capturedAt: string;
  reason: SnapshotReason;
  windowCount: number;
  tabCount: number;
  truncated: boolean;
}

export function summarizeSnapshot(snapshot: Snapshot): SnapshotSummary {
  return {
    id: snapshot.id,
    capturedAt: snapshot.capturedAt,
    reason: snapshot.reason,
    windowCount: snapshot.windows.length,
    tabCount: countTabs(snapshot),
    truncated: snapshot.truncated,
  };
}

export function countTabs(snapshot: Snapshot): number {
  return snapshot.windows.reduce((total, window) => total + window.tabs.length, 0);
}

export interface RawSnapshotWindow {
  windowId?: number;
  tabs: Array<{ url?: string; title?: string }>;
}

/**
 * Builds a bounded snapshot from browser windows. Only http(s) URLs are kept, so internal
 * pages, extension pages and other restricted URLs are never stored. Returns undefined when
 * nothing storable remains.
 */
export function buildSnapshot(
  windows: RawSnapshotWindow[],
  options: { id: string; capturedAt: string; reason: SnapshotReason },
): Snapshot | undefined {
  let bytes = 0;
  let truncated = false;
  const kept: Snapshot['windows'] = [];

  for (const window of windows) {
    const tabs: Snapshot['windows'][number]['tabs'] = [];
    for (const tab of window.tabs) {
      if (!tab.url || tab.url.length > MAX_URL_LENGTH || !isEligibleUrl(tab.url)) continue;
      const title = (tab.title ?? '').slice(0, MAX_TITLE_LENGTH);
      const size = tab.url.length + title.length + 32;
      if (bytes + size > MAX_SNAPSHOT_BYTES) {
        truncated = true;
        continue;
      }
      bytes += size;
      tabs.push({ url: tab.url, title });
    }
    if (tabs.length > 0) kept.push({ ...(window.windowId === undefined ? {} : { windowId: window.windowId }), tabs });
  }

  return kept.length > 0 ? { ...options, windows: kept, truncated } : undefined;
}

/** Identity of the tab set, ignoring titles, order and window grouping. */
export function snapshotSignature(snapshot: Snapshot): string {
  return [...new Set(snapshot.windows.flatMap((window) => window.tabs.map((tab) => tab.url)))].sort().join('\n');
}
