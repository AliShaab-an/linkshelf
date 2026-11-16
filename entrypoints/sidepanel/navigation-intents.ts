import type { SidePanelNavigationIntent } from '@/domain/side-panel';

export function createNavigationIntents({
  consume, blocked, apply,
}: {
  consume(requestId: string, isMounted: () => boolean): Promise<boolean>;
  blocked(): boolean;
  apply(intent: SidePanelNavigationIntent): void;
}) {
  const seen = new Set<string>();
  let disposed = false;
  let localRevision = 0;
  let sequence = 0;
  let latestConsumed = 0;

  return {
    supersede() { localRevision++; },
    dispose() { disposed = true; },
    async receive(intent: SidePanelNavigationIntent) {
      if (disposed) return;
      const duplicate = seen.has(intent.requestId);
      seen.add(intent.requestId);
      const request = ++sequence;
      const localChoice = localRevision;
      const blockedOnReceipt = blocked();
      const consumed = await consume(intent.requestId, () => !disposed);
      if (!consumed || disposed || duplicate || request <= latestConsumed) return;
      latestConsumed = request;
      if (localChoice === localRevision && !blockedOnReceipt && !blocked()) apply(intent);
    },
  };
}
