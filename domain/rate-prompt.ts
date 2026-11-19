import { z } from 'zod';

/** The rate prompt lives under its own key so it never touches the main database. */
export const RATE_PROMPT_STORAGE_KEY = 'linkshelfRatePrompt';
/** New users are asked after this many parked tabs. */
export const RATE_PROMPT_PARK_THRESHOLD = 5;
/** "Maybe later" asks once more after this many further parked tabs. */
export const RATE_PROMPT_ASK_AGAIN_AFTER = 20;
export const RATE_PROMPT_REVIEW_URL = 'https://chromewebstore.google.com/detail/gjalnaecjpapffifhlcnhomnehcdlmgm/reviews';

export const RatePromptStateSchema = z.object({
  version: z.literal(1),
  parked: z.number().int().nonnegative(),
  status: z.enum(['counting', 'due', 'later', 'done']),
  askAgainAt: z.number().int().nonnegative().optional(),
  laterCount: z.number().int().nonnegative(),
});
export type RatePromptState = z.infer<typeof RatePromptStateSchema>;
export type RatePromptAnswer = 'rate' | 'later' | 'never';

/** A fresh install counts parked tabs; someone updating from an earlier version is asked right away. */
export function initialRatePrompt(kind: 'new' | 'existing'): RatePromptState {
  return { version: 1, parked: 0, status: kind === 'existing' ? 'due' : 'counting', laterCount: 0 };
}

export function recordParkedTabs(state: RatePromptState, count: number): RatePromptState {
  if (!Number.isInteger(count) || count <= 0 || state.status === 'done') return state;
  const parked = state.parked + count;
  if (state.status === 'counting' && parked >= RATE_PROMPT_PARK_THRESHOLD) return { ...state, parked, status: 'due' };
  if (state.status === 'later' && parked >= (state.askAgainAt ?? 0)) {
    const { askAgainAt: _done, ...rest } = state;
    return { ...rest, parked, status: 'due' };
  }
  return { ...state, parked };
}

/** Rating or "Don't ask again" ends the prompt; "Maybe later" defers it once, then ends it. */
export function answerRatePrompt(state: RatePromptState, answer: RatePromptAnswer): RatePromptState {
  const { askAgainAt: _previous, ...rest } = state;
  if (answer !== 'later' || state.laterCount >= 1) return { ...rest, status: 'done' };
  return { ...rest, status: 'later', askAgainAt: state.parked + RATE_PROMPT_ASK_AGAIN_AFTER, laterCount: state.laterCount + 1 };
}

export const isRatePromptVisible = (state: RatePromptState) => state.status === 'due';
