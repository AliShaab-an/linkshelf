import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_UI_STATE, loadUiState, updateUiState, UI_STATE_STORAGE_KEY } from './ui-state';

describe('sidebar navigation preferences', () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    stored = {};
    vi.stubGlobal('browser', {
      storage: { local: {
        get: vi.fn(async () => ({ ...stored })),
        set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(stored, patch); }),
      } },
    });
  });

  it('keeps navigation and project changes made at the same time', async () => {
    await Promise.all([
      updateUiState({ selectedProjectId: 'work', expandedSessionIds: ['session-1'] }),
      updateUiState({ lastSection: 'projects' }),
    ]);
    expect(await loadUiState()).toEqual({ ...DEFAULT_UI_STATE, selectedProjectId: 'work', expandedSessionIds: ['session-1'], lastSection: 'projects' });
  });

  it('preserves preferences stored before the sidebar redesign', async () => {
    stored[UI_STATE_STORAGE_KEY] = { lastSection: 'settings', selectedProjectId: 'work', sessionOrder: 'oldest', expandedSessionIds: ['old-session'] };
    expect(await loadUiState()).toEqual(stored[UI_STATE_STORAGE_KEY]);
  });

  it('can remember a new view after an earlier preference write fails', async () => {
    browser.storage.local.set = vi.fn().mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockImplementation(async (patch: Record<string, unknown>) => { Object.assign(stored, patch); });
    await expect(updateUiState({ lastSection: 'today' })).rejects.toThrow('Storage unavailable');
    await updateUiState({ lastSection: 'projects' });
    expect((await loadUiState()).lastSection).toBe('projects');
  });
});
