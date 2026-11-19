import {
  RATE_PROMPT_STORAGE_KEY,
  RatePromptStateSchema,
  answerRatePrompt,
  initialRatePrompt,
  recordParkedTabs,
  type RatePromptAnswer,
  type RatePromptState,
} from '@/domain/rate-prompt';
import type { StorageAdapter } from './storage-adapter';

/**
 * Serialized reads and writes for the rate prompt. A missing or invalid record is
 * treated as a new user who is still counting, so a broken record can never nag.
 */
export class RatePromptStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StorageAdapter) {}

  private run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<RatePromptState | undefined> {
    const raw = await this.storage.get(RATE_PROMPT_STORAGE_KEY);
    if (raw === undefined) return undefined;
    const parsed = RatePromptStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }

  private update(change: (state: RatePromptState) => RatePromptState): Promise<RatePromptState> {
    return this.run(async () => {
      const stored = await this.read();
      const current = stored ?? initialRatePrompt('new');
      const next = change(current);
      if (next !== current || !stored) await this.storage.set(RATE_PROMPT_STORAGE_KEY, next);
      return next;
    });
  }

  get(): Promise<RatePromptState> {
    return this.run(async () => (await this.read()) ?? initialRatePrompt('new'));
  }

  /** Called from `runtime.onInstalled`. Only the first record is written; later updates keep it. */
  begin(kind: 'new' | 'existing'): Promise<RatePromptState> {
    return this.run(async () => {
      const current = await this.read();
      if (current) return current;
      const next = initialRatePrompt(kind);
      await this.storage.set(RATE_PROMPT_STORAGE_KEY, next);
      return next;
    });
  }

  recordParked(count: number): Promise<RatePromptState> {
    return this.update(state => recordParkedTabs(state, count));
  }

  answer(answer: RatePromptAnswer): Promise<RatePromptState> {
    return this.update(state => answerRatePrompt(state, answer));
  }
}
