import { z } from 'zod';
import {
  SidePanelSectionSchema,
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
  const current = await loadUiState();
  const next = UiStateSchema.parse({ ...current, ...patch });
  await browser.storage.local.set({ [UI_STATE_STORAGE_KEY]: next });
  return next;
}

export function readWindowIntent(
  value: unknown,
  windowId: number,
): SidePanelNavigationIntent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[String(windowId)];
  const parsed = z.strictObject({
    section: SidePanelSectionSchema,
    focusTarget: z.enum(['search-query']).optional(),
    requestId: z.string().min(1),
  }).safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

