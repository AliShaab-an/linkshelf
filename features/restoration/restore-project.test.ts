import { describe, expect, it, vi } from 'vitest';
import type { SavedLink } from '@/domain/schemas';
import type { RestoreProjectMessage } from '@/messaging/contracts';
import {
  executeRestoreProject,
  type RestoreProjectDependencies,
} from './restore-project';

const message: RestoreProjectMessage = {
  type: 'RESTORE_PROJECT',
  payload: { projectId: 'project-1' },
};

const links: SavedLink[] = [1, 2, 3].map((number) => ({
  id: `link-${number}`,
  sessionId: number < 3 ? 'session-1' : 'session-2',
  projectId: 'project-1',
  title: `Link ${number}`,
  url: `https://example.com/${number}`,
  normalizedUrl: `https://example.com/${number}`,
  domain: 'example.com',
  status: 'parked',
  pinnedBeforeParking: false,
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
}));

function dependencies(): RestoreProjectDependencies {
  return {
    getParkedLinks: vi.fn().mockResolvedValue(links),
    openTab: vi.fn().mockResolvedValue(undefined),
    markLinkRestored: vi.fn(async (linkId) => ({
      ...links.find((link) => link.id === linkId)!,
      status: 'restored' as const,
    })),
  };
}

describe('executeRestoreProject', () => {
  it('restores links across every project session', async () => {
    const deps = dependencies();
    const response = await executeRestoreProject(message, deps);

    expect(deps.openTab).toHaveBeenCalledTimes(3);
    expect(response).toEqual({
      success: true,
      projectId: 'project-1',
      restoredLinkIds: ['link-1', 'link-2', 'link-3'],
      failedLinkIds: [],
      complete: true,
    });
  });

  it('reports partial success without removing failed links', async () => {
    const deps = dependencies();
    deps.openTab = vi.fn(async (url) => {
      if (url.endsWith('/2')) throw new Error('failed');
    });

    const response = await executeRestoreProject(message, deps);

    expect(response).toMatchObject({
      success: true,
      restoredLinkIds: ['link-1', 'link-3'],
      failedLinkIds: ['link-2'],
      complete: false,
    });
  });

  it('does not open anything for an empty project', async () => {
    const deps = dependencies();
    deps.getParkedLinks = vi.fn().mockResolvedValue([]);

    const response = await executeRestoreProject(message, deps);

    expect(deps.openTab).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      error: { code: 'PROJECT_EMPTY' },
    });
  });
});
