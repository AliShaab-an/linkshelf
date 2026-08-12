import { getDomain, isEligibleUrl } from '@/domain/url';
import type { WindowTabCandidate, WindowTabStatus } from '@/messaging/contracts';

export interface WindowTabSnapshot {
  id?: number;
  title?: string;
  url?: string;
  index: number;
  active: boolean;
  pinned: boolean;
}

function getTabStatus(tab: WindowTabSnapshot): {
  status: WindowTabStatus;
  reason?: string;
} {
  if (!tab.url || !isEligibleUrl(tab.url)) {
    return {
      status: 'restricted',
      reason: 'Chrome does not allow this page to be parked.',
    };
  }

  if (tab.pinned) {
    return {
      status: 'pinned',
      reason: 'Pinned tabs are excluded by default for safety.',
    };
  }

  return { status: 'eligible' };
}

export function classifyWindowTabs(
  tabs: WindowTabSnapshot[],
): WindowTabCandidate[] {
  return tabs
    .filter((tab): tab is WindowTabSnapshot & { id: number } => tab.id !== undefined)
    .map((tab) => {
      const url = tab.url ?? '';

      return {
        id: tab.id,
        title: tab.title || 'Untitled tab',
        url,
        domain: isEligibleUrl(url) ? getDomain(url) : 'Restricted page',
        index: tab.index,
        active: tab.active,
        pinned: tab.pinned,
        ...getTabStatus(tab),
      };
    })
    .sort((first, second) => first.index - second.index);
}
