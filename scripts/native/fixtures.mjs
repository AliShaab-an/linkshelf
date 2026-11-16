// Representative historical shapes, generated entirely from synthetic values.
// These are not exports from a user profile or evidence of a Store upgrade.
export const timestamp = '2026-11-01T10:00:00.000Z';
export function library(count = 4, version = 2) {
  const settings = {
    schemaVersion: version, defaultProjectId: 'legacy-project', includePinnedTabsByDefault: false,
    confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove',
    trackingParamsToRemove: ['utm_source'],
    ...(version === 2 ? { displayDensity: 'compact', defaultRestoreMode: 'normal' } : {}),
  };
  return {
    projects: [
      { id: 'legacy-inbox', name: 'Inbox', isInbox: true, createdAt: timestamp, updatedAt: timestamp },
      { id: 'legacy-project', name: 'Synthetic research Ω', isInbox: false, createdAt: timestamp, updatedAt: timestamp },
    ],
    sessions: [{ id: 'legacy-session', projectId: 'legacy-project', note: 'Shared historical note Ω', reminderAt: '2099-01-01T10:00:00.000Z', createdAt: timestamp, updatedAt: timestamp }],
    links: Array.from({ length: count }, (_, i) => ({
      id: `historical-${i}`, sessionId: 'legacy-session', projectId: 'legacy-project',
      title: `Synthetic historical ${i}`, url: `https://example.invalid/historical/${i}`,
      normalizedUrl: `https://example.invalid/historical/${i}`, domain: 'example.invalid',
      note: `Synthetic note Ω ${i}`, status: ['parked', 'archived', 'restored', 'removed'][i % 4],
      reminderAt: '2099-01-01T10:00:00.000Z', pinnedBeforeParking: false, originalIndex: i,
      createdAt: timestamp, updatedAt: timestamp,
      ...(i % 4 === 1 ? { archivedAt: timestamp, reminderNotifiedAt: timestamp } : {}),
      ...(i % 4 === 2 ? { restoredAt: timestamp } : {}),
      ...(i % 4 === 3 ? { removedAt: timestamp, bookmarkedAt: timestamp, bookmarkId: 'synthetic-old-bookmark' } : {}),
    })), settings,
  };
}
export const backup = database => ({ format: 'linkshelf-backup', schemaVersion: database.settings.schemaVersion, exportedAt: timestamp, database });
