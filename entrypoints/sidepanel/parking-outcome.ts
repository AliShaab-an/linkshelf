import type { ParkSelectedTabsResponse } from '@/messaging/contracts';

export interface SavedSessionTarget {
  projectId: string;
  sessionId: string;
}

export function parkingOutcome(response: Extract<ParkSelectedTabsResponse, { success: true }>, projectId: string) {
  return {
    saved: response.linkIds.length,
    closed: response.closedTabIds.length,
    unconfirmed: response.failedToCloseTabIds.length,
    skipped: response.skippedDuplicateTabIds?.length ?? 0,
    target: response.sessionId ? { projectId, sessionId: response.sessionId } : undefined,
  };
}
