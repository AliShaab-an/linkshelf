import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIDE_PANEL_INTENTS_KEY, SIDE_PANEL_INTENTS_LOCK, type SidePanelNavigationIntent } from '@/domain/side-panel';
import { createNavigationIntents } from './navigation-intents';
import { consumeWindowIntent, DEFAULT_UI_STATE, loadUiState, UI_STATE_STORAGE_KEY, updateUiState } from './ui-state';

const search: SidePanelNavigationIntent = { section: 'search', focusTarget: 'search-query', requestId: 'search' };
const today: SidePanelNavigationIntent = { section: 'today', requestId: 'today' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(callback => { resolve = callback; });
  return { promise, resolve };
}

describe('sidebar navigation intents', () => {
  it('drops a modal-blocked request even if the dialog closes before consumption and the request is replayed', async () => {
    let modal = true;
    const consumed = deferred<boolean>();
    const apply = vi.fn();
    const consumer = createNavigationIntents({ consume: () => consumed.promise, blocked: () => modal, apply });
    const result = consumer.receive(search);
    modal = false;
    consumed.resolve(true);
    await result;
    await consumer.receive(today);
    await consumer.receive(search);
    expect(apply.mock.calls).toEqual([[today]]);
  });

  it('a stale storage event cannot suppress a newer valid request', async () => {
    const current = deferred<boolean>();
    const apply = vi.fn();
    const consumer = createNavigationIntents({
      consume: id => id === search.requestId ? current.promise : Promise.resolve(false),
      blocked: () => false, apply,
    });
    const request = consumer.receive(search);
    await consumer.receive(today);
    current.resolve(true);
    await request;
    expect(apply.mock.calls).toEqual([[search]]);
  });

  it('keeps a newer consumed request when responses complete out of order', async () => {
    const first = deferred<boolean>();
    const apply = vi.fn();
    const consumer = createNavigationIntents({
      consume: id => id === today.requestId ? first.promise : Promise.resolve(true),
      blocked: () => false, apply,
    });
    const pending = consumer.receive(today);
    await consumer.receive(search);
    first.resolve(true);
    await pending;
    expect(apply.mock.calls).toEqual([[search]]);
  });

  it.each(['local navigation', 'unmount', 'new modal'])('does not apply a delayed request after %s', async reason => {
    const result = deferred<boolean>();
    let modal = false;
    const apply = vi.fn();
    const consumer = createNavigationIntents({ consume: () => result.promise, blocked: () => modal, apply });
    const pending = consumer.receive(search);
    if (reason === 'local navigation') consumer.supersede();
    if (reason === 'unmount') consumer.dispose();
    if (reason === 'new modal') modal = true;
    result.resolve(true);
    await pending;
    expect(apply).not.toHaveBeenCalled();
  });

  it('does not navigate on a failed consume or replay of that request', async () => {
    const apply = vi.fn();
    const consume = vi.fn().mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(true);
    const consumer = createNavigationIntents({ consume, blocked: () => false, apply });
    await expect(consumer.receive(search)).rejects.toThrow('storage unavailable');
    await consumer.receive(search);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('sidebar preference storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function storage() {
    const values: Record<string, unknown> = {};
    const get = vi.fn(async (key: string) => ({ [key]: structuredClone(values[key]) }));
    const set = vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); });
    const queues = new Map<string, Promise<unknown>>();
    const request = vi.fn((key: string, work: () => Promise<unknown>) => {
      const next = (queues.get(key) ?? Promise.resolve()).then(work);
      queues.set(key, next.catch(() => undefined));
      return next;
    });
    vi.stubGlobal('browser', { storage: { local: { get, set }, session: { get, set } } });
    vi.stubGlobal('navigator', { locks: { request } });
    return { values, request, set };
  }

  it('preserves independent preference patches and avoids rewriting an identical section', async () => {
    const { values, set } = storage();
    expect(await loadUiState()).toEqual(DEFAULT_UI_STATE);
    values[UI_STATE_STORAGE_KEY] = { lastSection: 'saved' };
    expect(await loadUiState()).toEqual(DEFAULT_UI_STATE);
    await Promise.all([
      updateUiState({ lastSection: 'search' }),
      updateUiState({ selectedProjectId: 'example', sessionOrder: 'oldest', expandedSessionIds: ['session'] }),
    ]);
    expect(await loadUiState()).toEqual({
      lastSection: 'search', selectedProjectId: 'example', sessionOrder: 'oldest', expandedSessionIds: ['session'],
    });
    await updateUiState({ lastSection: 'search' });
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('consumes only the current valid request under the same lock used by the producer', async () => {
    const { values, request, set } = storage();
    values[SIDE_PANEL_INTENTS_KEY] = { 7: search, 8: today, 9: { section: 'invalid' } };
    expect(await consumeWindowIntent(7, 'outdated', () => true)).toBe(false);
    expect(await consumeWindowIntent(9, 'invalid', () => true)).toBe(false);
    expect(await consumeWindowIntent(7, search.requestId, () => false)).toBe(false);
    expect(await consumeWindowIntent(7, search.requestId, () => true)).toBe(true);
    expect(values[SIDE_PANEL_INTENTS_KEY]).toEqual({ 8: today, 9: { section: 'invalid' } });
    expect(request).toHaveBeenCalledWith(SIDE_PANEL_INTENTS_LOCK, expect.any(Function));
    expect(set).toHaveBeenCalledTimes(1);
  });
});
