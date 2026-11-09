import type { SavedLink } from '@/domain/schemas';
import type { RestoreLinkMessage, RestoreProjectMessage, RestoreSessionMessage } from '@/messaging/contracts';
import type { LinkShelfRepository } from '@/storage/repository';
import { OperationCoordinator } from '@/features/operations/operation-coordinator';
import { executeRestoreLink } from './restore-link';
import { executeRestoreSession } from './restore-session';
import { executeRestoreProject } from './restore-project';
import type { RestoreTabOutcome } from './restore-collection';

interface RestoreTabsApi {
  query(query: { windowId: number }): Promise<unknown[]>;
  create(input: { url: string; active: boolean; windowId: number; index?: number }): Promise<{ id?: number }>;
  discard(id: number): Promise<{ discarded?: boolean } | undefined>;
}

export function createRestoreCoordinator(repository: LinkShelfRepository, operations: OperationCoordinator, tabs: RestoreTabsApi) {
  // Receipts are recovery data, not locks. Keep only confirmed opens awaiting persistence.
  const opened = new Map<string, { url: string; createdAt: string; outcome: RestoreTabOutcome }>();
  async function open(link: SavedLink, markAsRestored: boolean, create: () => Promise<RestoreTabOutcome>) {
    const previous = opened.get(link.id);
    if (previous?.url === link.url && previous.createdAt === link.createdAt) return previous.outcome;
    const outcome = await create();
    if (markAsRestored) opened.set(link.id, { url: link.url, createdAt: link.createdAt, outcome });
    return outcome;
  }
  async function markRestored(id: string) {
    const result = await repository.markLinkRestored(id);
    opened.delete(id);
    return result;
  }
  const linkKeys = (ids: string[]) => ids.map((id) => `link:${id}`);

  return {
    restoreLink(message: RestoreLinkMessage, selectTarget: () => Promise<number>) {
      return operations.reserve(linkKeys([message.payload.linkId]), async () => {
        const [windowId, settings] = await Promise.all([selectTarget(), repository.getSettings()]);
        return operations.enqueue(`window:${windowId}`, async () => {
          let captured: SavedLink;
          const result = await executeRestoreLink(message, {
            getLink: async (id) => { const link = await repository.getLink(id); if (link) captured = link; return link; },
            openTab: () => open(captured, settings.defaultRestoreBehavior === 'restore-and-remove', async () => {
              await tabs.create({ url: captured.url, active: true, windowId });
              return { discarded: false, fallback: false };
            }).then(() => undefined),
            markLinkRestored: markRestored,
            markAsRestored: settings.defaultRestoreBehavior === 'restore-and-remove',
          });
          if (result.success) opened.delete(message.payload.linkId);
          return result;
        });
      });
    },

    async restoreCollection(message: RestoreSessionMessage | RestoreProjectMessage, selectTarget: () => Promise<number>) {
      // Capture focus now, before reads or another batch's window queue can yield.
      const target = selectTarget();
      void target.catch(() => undefined);
      const snapshot = message.type === 'RESTORE_SESSION'
        ? await repository.getParkedLinksBySession(message.payload.sessionId)
        : (await repository.getParkedSessionGroups(message.payload.projectId)).flatMap((group) => group.links);
      return operations.reserve(linkKeys(snapshot.map((link) => link.id)), async () => {
        const [windowId, settings] = await Promise.all([target, repository.getSettings()]);
        return operations.enqueue(`window:${windowId}`, async () => {
          const markAsRestored = settings.defaultRestoreBehavior === 'restore-and-remove';
          const mode = message.type === 'RESTORE_PROJECT' ? message.payload.mode : 'normal';
          let nextIndex = (await tabs.query({ windowId })).length;
          const dependencies = {
            getParkedLinks: async () => snapshot,
            getLink: (id: string) => repository.getLink(id),
            openTab: (url: string, link?: SavedLink) => open(link!, markAsRestored, async () => {
              const tab = await tabs.create({ url, active: false, windowId, index: nextIndex });
              nextIndex += 1;
              if (mode === 'normal' || tab.id === undefined) return { discarded: false, fallback: mode === 'unloaded' };
              try {
                const discarded = await tabs.discard(tab.id);
                if (discarded?.discarded) return { discarded: true, fallback: false };
              } catch { /* Confirmed open; report an unloaded-mode fallback rather than retrying creation. */ }
              return { discarded: false, fallback: true };
            }),
            markLinkRestored: markRestored,
            markAsRestored,
          };
          const result = message.type === 'RESTORE_SESSION'
            ? await executeRestoreSession(message, dependencies)
            : await executeRestoreProject(message, dependencies);
          if (result.success) result.openedLinkIds.forEach((id) => opened.delete(id));
          return result;
        });
      });
    },
  };
}
