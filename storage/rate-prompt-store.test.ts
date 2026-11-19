import { describe, expect, it } from 'vitest';
import { RATE_PROMPT_STORAGE_KEY, isRatePromptVisible } from '@/domain/rate-prompt';
import { RatePromptStore } from './rate-prompt-store';
import type { StorageAdapter } from './storage-adapter';

function memory(initial: Record<string, unknown> = {}): StorageAdapter & { data: Record<string, unknown> } {
  const data = { ...initial };
  return { data, get: async key => structuredClone(data[key]), set: async (key, value) => { data[key] = structuredClone(value); } };
}

describe('RatePromptStore', () => {
  it('asks a new user after five parked tabs', async () => {
    const store = new RatePromptStore(memory());
    await store.begin('new');
    expect(isRatePromptVisible(await store.recordParked(4))).toBe(false);
    expect(isRatePromptVisible(await store.recordParked(1))).toBe(true);
  });

  it('asks an existing user right after updating, but only the first time', async () => {
    const storage = memory();
    const store = new RatePromptStore(storage);
    expect(isRatePromptVisible(await store.begin('existing'))).toBe(true);
    await store.answer('never');
    expect(isRatePromptVisible(await store.begin('existing'))).toBe(false);
    expect((storage.data[RATE_PROMPT_STORAGE_KEY] as { status: string }).status).toBe('done');
  });

  it('asks once more twenty tabs after "Maybe later", then never again', async () => {
    const store = new RatePromptStore(memory());
    await store.begin('new');
    await store.recordParked(5);
    expect((await store.answer('later')).status).toBe('later');
    expect(isRatePromptVisible(await store.recordParked(19))).toBe(false);
    expect(isRatePromptVisible(await store.recordParked(1))).toBe(true);
    expect((await store.answer('later')).status).toBe('done');
    expect(isRatePromptVisible(await store.recordParked(100))).toBe(false);
  });

  it('ends the prompt once the user chooses to rate', async () => {
    const store = new RatePromptStore(memory());
    await store.begin('existing');
    expect((await store.answer('rate')).status).toBe('done');
  });

  it('treats a missing or invalid record as a new user who is still counting', async () => {
    const store = new RatePromptStore(memory({ [RATE_PROMPT_STORAGE_KEY]: { version: 9 } }));
    expect(isRatePromptVisible(await store.get())).toBe(false);
    expect(isRatePromptVisible(await store.recordParked(5))).toBe(true);
  });

  it('ignores counts that are not positive whole numbers', async () => {
    const store = new RatePromptStore(memory());
    await store.begin('new');
    await store.recordParked(0);
    await store.recordParked(-3);
    await store.recordParked(2.5);
    expect((await store.get()).parked).toBe(0);
  });
});
