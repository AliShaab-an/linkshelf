import { describe, expect, it } from 'vitest';
import { describeCollectionRestore, describeLinkRestore } from './restore-feedback';

const progress = {
  openedLinkIds: ['same-url-1', 'same-url-2'],
  restoredLinkIds: ['same-url-1', 'same-url-2'],
  failedLinkIds: ['unconfirmed'],
  discardedLinkIds: ['same-url-1'],
  fallbackLinkIds: ['same-url-2'],
};

describe('restore feedback', () => {
  it('distinguishes confirmed opens, persisted records, and unload outcomes', () => {
    const message = describeCollectionRestore({ ...progress, success: true, projectId: 'project', complete: false });
    expect(message).toBe('Opened 2 tabs. 2 marked restored in LinkShelf. Chrome could not confirm opening 1 tab. 1 opened unloaded. 1 loaded normally when unloading failed.');
  });

  it('identifies successful parked copies', () => {
    expect(describeCollectionRestore({
      ...progress, restoredLinkIds: [], success: true, sessionId: 'session', complete: false,
    })).toContain('2 kept as parked copies.');
  });

  it('avoids claiming intentional copies after a storage failure', () => {
    expect(describeCollectionRestore({
      success: false, opened: true, progress: { ...progress, restoredLinkIds: [] },
      error: { code: 'STORAGE_FAILED', message: 'Storage could not be verified.' },
    })).toMatch(/^Opened 2 tabs\. 0 marked restored in LinkShelf\.(?!.*parked copies)/);
  });

  it('distinguishes a single confirmed restoration from a parked copy', () => {
    const result = { success: true, opened: true, linkId: 'link' } as const;
    expect(describeLinkRestore({ ...result, restored: true })).toBe('Tab opened and marked restored in LinkShelf.');
    expect(describeLinkRestore({ ...result, restored: false })).toBe('Opened a copy. The link remains parked.');
  });
});
