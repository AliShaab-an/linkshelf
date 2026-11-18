import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForTabCommit, type TabCommitApi } from './tab-commit';

type Listener = (id: number, info: unknown, tab: { url?: string }) => void;

function tabsApi(initial: { url?: string } | Error) {
  const listeners = new Set<Listener>();
  const api: TabCommitApi = {
    get: vi.fn(async () => { if (initial instanceof Error) throw initial; return initial; }),
    onUpdated: { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener) },
  };
  return { api, listeners, emit: (id: number, tab: { url?: string }) => [...listeners].forEach((listener) => listener(id, {}, tab)) };
}

afterEach(() => vi.useRealTimers());

describe('waitForTabCommit', () => {
  it('resolves true immediately when the tab already has an address', async () => {
    const { api, listeners } = tabsApi({ url: 'https://a.example/' });
    expect(await waitForTabCommit(api, 5)).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('resolves true when the matching tab commits, ignoring other tabs', async () => {
    const { api, emit, listeners } = tabsApi({ url: '' });
    const result = waitForTabCommit(api, 5);
    await Promise.resolve();
    emit(6, { url: 'https://other.example/' });
    emit(5, {});
    emit(5, { url: 'https://a.example/' });
    expect(await result).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('resolves false after the timeout so the tab can stay loaded', async () => {
    vi.useFakeTimers();
    const { api, listeners } = tabsApi({ url: '' });
    const result = waitForTabCommit(api, 5, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it('resolves false when the tab no longer exists', async () => {
    const { api } = tabsApi(new Error('No tab'));
    expect(await waitForTabCommit(api, 5)).toBe(false);
  });
});
