export interface TabCommitApi {
  get(id: number): Promise<{ url?: string }>;
  onUpdated: {
    addListener(listener: (id: number, info: unknown, tab: { url?: string }) => void): void;
    removeListener(listener: (id: number, info: unknown, tab: { url?: string }) => void): void;
  };
}

export const TAB_COMMIT_TIMEOUT_MS = 5000;

/**
 * Resolves true once Chrome has committed the tab's navigation (it then has an address).
 * A tab discarded before that point loses its address and comes back blank, so callers
 * must leave the tab loaded when this resolves false.
 */
export async function waitForTabCommit(tabs: TabCommitApi, tabId: number, timeoutMs = TAB_COMMIT_TIMEOUT_MS): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (committed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tabs.onUpdated.removeListener(listener);
      resolve(committed);
    };
    const listener = (id: number, _info: unknown, tab: { url?: string }) => {
      if (id === tabId && tab.url) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    tabs.onUpdated.addListener(listener);
    // The navigation may already have committed before the listener was attached.
    tabs.get(tabId).then((tab) => { if (tab.url) finish(true); }, () => finish(false));
  });
}
