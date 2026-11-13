import { z } from 'zod';
import {
  SidePanelSectionSchema,
  SidePanelNavigationIntentSchema,
  SIDE_PANEL_INTENTS_KEY,
  SIDE_PANEL_INTENTS_LOCK,
  type SidePanelNavigationIntent,
} from '@/domain/side-panel';

export const UI_STATE_STORAGE_KEY = 'linkshelfUiState';

const UiStateSchema = z.strictObject({
  lastSection: SidePanelSectionSchema,
  selectedProjectId: z.string().min(1),
  sessionOrder: z.enum(['newest', 'oldest']),
  expandedSessionIds: z.array(z.string().min(1)),
});

export type UiState = z.infer<typeof UiStateSchema>;

export const DEFAULT_UI_STATE: UiState = {
  lastSection: 'projects',
  selectedProjectId: 'inbox',
  sessionOrder: 'newest',
  expandedSessionIds: [],
};

export async function loadUiState(): Promise<UiState> {
  const stored = await browser.storage.local.get(UI_STATE_STORAGE_KEY);
  const parsed = UiStateSchema.safeParse(stored[UI_STATE_STORAGE_KEY]);
  return parsed.success ? parsed.data : DEFAULT_UI_STATE;
}

export async function updateUiState(patch: Partial<UiState>): Promise<UiState> {
  return navigator.locks.request(UI_STATE_STORAGE_KEY, async () => {
    const current = await loadUiState();
    const next = UiStateSchema.parse({ ...current, ...patch });
    if (Object.entries(patch).every(([key, value]) => current[key as keyof UiState] === value)) return current;
    await browser.storage.local.set({ [UI_STATE_STORAGE_KEY]: next });
    return next;
  });
}

export function readWindowIntent(
  value: unknown,
  windowId: number,
): SidePanelNavigationIntent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[String(windowId)];
  const parsed = SidePanelNavigationIntentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export async function consumeWindowIntent(windowId: number, requestId: string, isMounted: () => boolean) {
  return navigator.locks.request(SIDE_PANEL_INTENTS_LOCK, async () => {
    if (!isMounted()) return false;
    const stored = await browser.storage.session.get(SIDE_PANEL_INTENTS_KEY);
    const current = stored[SIDE_PANEL_INTENTS_KEY];
    if (!isMounted() || !current || typeof current !== 'object' ||
        readWindowIntent(current, windowId)?.requestId !== requestId) return false;
    const next: Record<string, unknown> = { ...current };
    delete next[String(windowId)];
    await browser.storage.session.set({ [SIDE_PANEL_INTENTS_KEY]: next });
    return true;
  });
}

