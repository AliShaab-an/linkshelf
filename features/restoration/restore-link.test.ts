import { describe, expect, it, vi } from 'vitest';
import type { SavedLink } from '@/domain/schemas';
import type { RestoreLinkMessage } from '@/messaging/contracts';
import {
  executeRestoreLink,
  type RestoreLinkDependencies,
} from './restore-link';

const message: RestoreLinkMessage = {
  type: 'RESTORE_LINK',
  payload: { linkId: 'link-1' },
};

const link: SavedLink = {
  id: 'link-1',
  sessionId: 'session-1',
  projectId: 'inbox',
  title: 'Example',
  url: 'https://example.com',
  normalizedUrl: 'https://example.com',
  domain: 'example.com',
  status: 'parked',
  pinnedBeforeParking: false,
  createdAt: '2026-08-10T12:00:00.000Z',
  updatedAt: '2026-08-10T12:00:00.000Z',
};

function createDependencies(): RestoreLinkDependencies {
  return {
    getLink: vi.fn().mockResolvedValue(link),
    openTab: vi.fn().mockResolvedValue(undefined),
    markLinkRestored: vi.fn().mockResolvedValue({
      ...link,
      status: 'restored' as const,
    }),
  };
}

describe('executeRestoreLink', () => {
  it('opens the tab before marking the link as restored', async () => {
    const events: string[] = [];
    const dependencies = createDependencies();
    dependencies.openTab = vi.fn(async () => {
      events.push('opened');
    });
    dependencies.markLinkRestored = vi.fn(async () => {
      events.push('updated');
      return { ...link, status: 'restored' as const };
    });

    const response = await executeRestoreLink(message, dependencies);

    expect(events).toEqual(['opened', 'updated']);
    expect(response).toEqual({
      success: true,
      linkId: 'link-1',
      opened: true,
    });
  });

  it('keeps the link parked if Chrome cannot open it', async () => {
    const dependencies = createDependencies();
    dependencies.openTab = vi.fn().mockRejectedValue(new Error('open failed'));

    const response = await executeRestoreLink(message, dependencies);

    expect(dependencies.markLinkRestored).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      opened: false,
      error: { code: 'TAB_OPEN_FAILED' },
    });
  });

  it('reports when the tab opened but storage could not be updated', async () => {
    const dependencies = createDependencies();
    dependencies.markLinkRestored = vi
      .fn()
      .mockRejectedValue(new Error('storage failed'));

    const response = await executeRestoreLink(message, dependencies);

    expect(response).toMatchObject({
      success: false,
      opened: true,
      error: { code: 'STORAGE_FAILED' },
    });
  });

  it('does not open a link that is no longer parked', async () => {
    const dependencies = createDependencies();
    dependencies.getLink = vi.fn().mockResolvedValue({
      ...link,
      status: 'restored',
    });

    const response = await executeRestoreLink(message, dependencies);

    expect(dependencies.openTab).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      error: { code: 'LINK_NOT_PARKED' },
    });
  });
});
