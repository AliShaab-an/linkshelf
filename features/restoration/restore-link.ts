import type { SavedLink } from '@/domain/schemas';
import type {
  RestoreLinkMessage,
  RestoreLinkResponse,
} from '@/messaging/contracts';

export interface RestoreLinkDependencies {
  getLink(linkId: string): Promise<SavedLink | undefined>;
  openTab(url: string): Promise<void>;
  markLinkRestored(linkId: string): Promise<SavedLink>;
}

export async function executeRestoreLink(
  message: RestoreLinkMessage,
  dependencies: RestoreLinkDependencies,
): Promise<RestoreLinkResponse> {
  let link: SavedLink | undefined;

  try {
    link = await dependencies.getLink(message.payload.linkId);
  } catch (error) {
    console.error('Failed to read a saved link:', error);

    return {
      success: false,
      opened: false,
      error: {
        code: 'STORAGE_FAILED',
        message: 'LinkShelf could not read this saved link.',
      },
    };
  }

  if (!link) {
    return {
      success: false,
      opened: false,
      error: {
        code: 'LINK_NOT_FOUND',
        message: 'This saved link no longer exists.',
      },
    };
  }

  if (link.status !== 'parked') {
    return {
      success: false,
      opened: false,
      error: {
        code: 'LINK_NOT_PARKED',
        message: 'This link is no longer parked.',
      },
    };
  }

  try {
    await dependencies.openTab(link.url);
  } catch (error) {
    console.error('Failed to open a restored tab:', error);

    return {
      success: false,
      opened: false,
      error: {
        code: 'TAB_OPEN_FAILED',
        message: 'The link stayed parked because Chrome could not open it.',
      },
    };
  }

  try {
    await dependencies.markLinkRestored(link.id);
  } catch (error) {
    console.error('The tab opened but its saved state could not be updated:', error);

    return {
      success: false,
      opened: true,
      error: {
        code: 'STORAGE_FAILED',
        message: 'The tab opened, but the link is still parked because storage failed.',
      },
    };
  }

  return {
    success: true,
    linkId: link.id,
    opened: true,
  };
}
