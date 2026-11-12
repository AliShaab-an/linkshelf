import type { SavedLink } from '@/domain/schemas';
import { restoreIdentity, sameRestoreIdentity, type RestoreIdentity } from '@/domain/restore-identity';
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
  const opened = new Map<string, { identity: RestoreIdentity; outcome: RestoreTabOutcome }>();
  async function open(link: SavedLink, markAsRestored: boolean, create: () => Promise<{ id?: number }>, unloaded = false) {
    const previous = opened.get(link.id);
    if (previous) {
      if (!sameRestoreIdentity(previous.identity, link)) throw new Error('The saved link no longer matches an unacknowledged tab opening.');
      return previous.outcome;
    }
    const tab = await create();
    const outcome = { discarded: false, fallback: unloaded };
    if (markAsRestored) opened.set(link.id, { identity: restoreIdentity(link), outcome });
    if (unloaded && tab.id !== undefined) {
      try {
        if ((await tabs.discard(tab.id))?.discarded) {
          outcome.discarded = true;
          outcome.fallback = false;
        }
      } catch { /* Chrome confirmed opening. Discard failure is a fallback. */ }
    }
    return outcome;
  }
  async function markRestored(id: string) {
    const result = await repository.markLinkRestored(id, opened.get(id)?.identity);
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
            openTab: () => open(captured, settings.defaultRestoreBehavior === 'restore-and-remove',
              () => tabs.create({ url: captured.url, active: true, windowId })).then(() => undefined),
            markLinkRestored: markRestored,
            markAsRestored: settings.defaultRestoreBehavior === 'restore-and-remove',
          });
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
              return tab;
            }, mode === 'unloaded'),
            markLinkRestored: markRestored,
            async markLinksRestoredBatch(confirmed: readonly SavedLink[]) {
              const identities = confirmed.map(link => {
                const receipt = opened.get(link.id);
                if (!receipt || !sameRestoreIdentity(receipt.identity, link)) {
                  throw new Error('A saved link has no matching confirmed tab opening.');
                }
                return receipt.identity;
              });
              await repository.markLinksRestoredBatch(identities);
              for (const link of confirmed) opened.delete(link.id);
            },
            markAsRestored,
          };
          const result = message.type === 'RESTORE_SESSION'
            ? await executeRestoreSession(message, dependencies)
            : await executeRestoreProject(message, dependencies);
          return result;
        });
      });
    },
  };
}
