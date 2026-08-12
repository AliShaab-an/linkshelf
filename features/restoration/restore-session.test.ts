import { describe, expect, it, vi } from 'vitest';
import type { SavedLink } from '@/domain/schemas';
import type { RestoreSessionMessage } from '@/messaging/contracts';
import {
  executeRestoreSession,
  type RestoreSessionDependencies,
} from './restore-session';

const message: RestoreSessionMessage = {
  type: 'RESTORE_SESSION',
  payload: { sessionId: 'session-1' },
};

const links: SavedLink[] = [1, 2].map((number) => ({
  id: `link-${number}`,
  sessionId: 'session-1',
  projectId: 'inbox',
  title: `Link ${number}`,
  url: `https://example.com/${number}`,
  normalizedUrl: `https://example.com/${number}`,
  domain: 'example.com',
  status: 'parked',
  pinnedBeforeParking: false,
  originalIndex: number,
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
}));

function dependencies(): RestoreSessionDependencies {
  return {
    getParkedLinks: vi.fn().mockResolvedValue(links),
    openTab: vi.fn().mockResolvedValue(undefined),
    markLinkRestored: vi.fn(async (linkId) => ({
      ...links.find((link) => link.id === linkId)!,
      status: 'restored' as const,
    })),
  };
}

describe('executeRestoreSession', () => {
  it('opens and updates every link in original order', async () => {
    const deps = dependencies();
    const response = await executeRestoreSession(message, deps);

    expect(deps.openTab).toHaveBeenNthCalledWith(1, links[0].url);
    expect(deps.openTab).toHaveBeenNthCalledWith(2, links[1].url);
    expect(response).toEqual({
      success: true,
      sessionId: 'session-1',
      restoredLinkIds: ['link-1', 'link-2'],
      failedLinkIds: [],
      complete: true,
    });
  });

  it('keeps failed links parked while restoring successful links', async () => {
    const deps = dependencies();
    deps.openTab = vi.fn(async (url) => {
      if (url.endsWith('/2')) throw new Error('failed');
    });

    const response = await executeRestoreSession(message, deps);

    expect(deps.markLinkRestored).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      success: true,
      restoredLinkIds: ['link-1'],
      failedLinkIds: ['link-2'],
      complete: false,
    });
  });

  it('does nothing when the session has no parked links', async () => {
    const deps = dependencies();
    deps.getParkedLinks = vi.fn().mockResolvedValue([]);

    const response = await executeRestoreSession(message, deps);

    expect(deps.openTab).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      error: { code: 'SESSION_EMPTY' },
    });
  });
});
