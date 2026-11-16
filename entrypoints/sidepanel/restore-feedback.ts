import type { RestoreLinkResponse, RestoreProjectResponse, RestoreSessionResponse } from '@/messaging/contracts';

export function describeLinkRestore(response: RestoreLinkResponse): string {
  if (!response.success) {
    return response.error.message;
  }
  return response.restored
    ? 'Tab opened and marked restored in LinkShelf.'
    : 'Opened a copy. The link remains parked.';
}

export function describeCollectionRestore(response: RestoreProjectResponse | RestoreSessionResponse): string {
  const progress = response.success ? response : response.progress;
  if (!progress) {
    return response.success || !response.opened ? '' : 'Chrome opened tabs before the operation failed.';
  }
  const opened = progress.openedLinkIds.length;
  const restored = progress.restoredLinkIds.length;
  const failed = progress.failedLinkIds.length;
  const unloaded = progress.discardedLinkIds.length;
  const fallback = progress.fallbackLinkIds.length;
  return [
    response.success && failed
      ? `Opened ${opened} of ${opened + failed} tabs.`
      : `Opened ${opened} ${opened === 1 ? 'tab' : 'tabs'}.`,
    `${restored} marked restored in LinkShelf.`,
    response.success && opened > 0 && restored === 0 ? `${opened} kept as parked copies.` : '',
    failed ? `Chrome could not confirm opening ${failed} ${failed === 1 ? 'tab' : 'tabs'}.` : '',
    unloaded ? `${unloaded} will load when selected.` : '',
    fallback ? `${fallback} loaded immediately because Chrome could not defer loading.` : '',
  ].filter(Boolean).join(' ');
}
