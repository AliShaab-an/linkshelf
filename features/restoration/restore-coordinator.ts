import type { SavedLink } from '@/domain/schemas';
import { restoreIdentity, sameRestoreIdentity, type RestoreIdentity } from '@/domain/restore-identity';
import type { RestoreLinkMessage, RestoreProjectMessage, RestoreSessionMessage } from '@/messaging/contracts';
import type { LinkShelfRepository } from '@/storage/repository';
import { OperationCoordinator } from '@/features/operations/operation-coordinator';
import { executeRestoreLink } from './restore-link';
import { executeRestoreSession } from './restore-session';
import { executeRestoreProject } from './restore-project';
import type { RestoreTabOutcome } from './restore-collection';
import { waitForTabCommit, type TabCommitApi } from './tab-commit';
import type { TabGroups } from '@/features/tab-groups/tab-groups';

export const TAB_GROUP_WARNING = 'Links opened, but Chrome could not restore some tab groups.';

interface RestoreTabsApi {
  query(query: { windowId: number }): Promise<unknown[]>;
  create(input: { url: string; active: boolean; windowId: number; index?: number }): Promise<{ id?: number }>;
  discard(id: number): Promise<{ discarded?: boolean } | undefined>;
  /** Optional so tests can omit it; production passes the real tabs API. */
  get?: TabCommitApi['get'];
  onUpdated?: TabCommitApi['onUpdated'];
}

export function createRestoreCoordinator(
  repository: LinkShelfRepository,
  operations: OperationCoordinator,
  tabs: RestoreTabsApi,
  /** Optional: restores tab groups when the person allowed it. Without it tabs open ungrouped. */
  tabGroups?: Pick<TabGroups, 'restore'>,
) {
  // Receipts are recovery data, not locks. Keep only confirmed opens awaiting persistence.
  const opened = new Map<string, { identity: RestoreIdentity; outcome: RestoreTabOutcome }>();
  // Tabs opened for a link and not yet grouped, kept until the operation that opened them finishes.
  const openedTabs = new Map<string, number>();
  async function open(link: SavedLink, markAsRestored: boolean, create: () => Promise<{ id?: number }>, unloaded = false) {
    const previous = opened.get(link.id);
    if (previous) {
      if (!sameRestoreIdentity(previous.identity, link)) throw new Error('The saved link no longer matches an unacknowledged tab opening.');
      return previous.outcome;
    }
    const tab = await create();
    if (tab.id !== undefined) openedTabs.set(link.id, tab.id);
    const outcome = { discarded: false, fallback: unloaded };
    if (markAsRestored) opened.set(link.id, { identity: restoreIdentity(link), outcome });
    if (unloaded && tab.id !== undefined) {
      try {
        // Discarding before the navigation commits leaves a blank tab, so wait; if Chrome never
        // commits it, the tab simply stays loaded and is reported as a fallback.
        const committed = tabs.get && tabs.onUpdated
          ? await waitForTabCommit({ get: tabs.get.bind(tabs), onUpdated: tabs.onUpdated }, tab.id)
          : true;
        if (committed && (await tabs.discard(tab.id))?.discarded) {
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

  /** Regroups the tabs opened for these links, then forgets them. A grouping problem is a warning, never a failure. */
  async function regroup<Response extends { warnings?: string[] }>(links: readonly SavedLink[], windowId: number, response: Response): Promise<Response> {
    const placements = links.flatMap((link) => {
      const tabId = openedTabs.get(link.id);
      openedTabs.delete(link.id);
      return tabId !== undefined && link.originalGroup ? [{ tabId, group: link.originalGroup }] : [];
    });
    if (!tabGroups || !placements.length) return response;
    let failed = false;
    try { failed = (await tabGroups.restore(placements, windowId)).failedGroups > 0; } catch { failed = true; }
    return failed ? { ...response, warnings: [...(response.warnings ?? []), TAB_GROUP_WARNING] } : response;
  }

  return {
    restoreLink(message: RestoreLinkMessage, selectTarget: () => Promise<number>) {
      return operations.reserve(linkKeys([message.payload.linkId]), async () => {
        const [windowId, settings] = await Promise.all([selectTarget(), repository.getSettings()]);
        return operations.enqueue(`window:${windowId}`, async () => {
          const markAsRestored = (message.payload.behavior ?? settings.defaultRestoreBehavior) === 'restore-and-remove';
          let captured: SavedLink | undefined;
          const result = await executeRestoreLink(message, {
            getLink: async (id) => { const link = await repository.getLink(id); if (link) captured = link; return link; },
            openTab: () => open(captured!, markAsRestored,
              () => tabs.create({ url: captured!.url, active: true, windowId })).then(() => undefined),
            markLinkRestored: markRestored,
            markAsRestored,
          });
          return regroup(captured ? [captured] : [], windowId, result);
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
          return regroup(snapshot, windowId, result);
        });
      });
    },
  };
}
