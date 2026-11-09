import { describe, expect, it, vi } from 'vitest';
import {
  executeSidePanelCommand,
  PANEL_COMMANDS,
  type SidePanelCommandDependencies,
} from './side-panel-commands';

function dependencies(openState?: boolean): SidePanelCommandDependencies {
  return {
    isOpen: vi.fn(() => openState),
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    setIntent: vi.fn(async () => undefined),
    createRequestId: vi.fn(() => 'request-1'),
  };
}

describe('side-panel commands', () => {
  it('closes a panel known to be open', async () => {
    const deps = dependencies(true);
    await expect(executeSidePanelCommand(PANEL_COMMANDS.toggle, 7, deps)).resolves.toBe('closed');
    expect(deps.close).toHaveBeenCalledWith(7);
    expect(deps.open).not.toHaveBeenCalled();
  });

  it('uses the safe open fallback when panel state is unavailable', async () => {
    const deps = dependencies(undefined);
    await expect(executeSidePanelCommand(PANEL_COMMANDS.toggle, 8, deps)).resolves.toBe('opened');
    expect(deps.open).toHaveBeenCalledWith(8);
    expect(deps.close).not.toHaveBeenCalled();
  });

  it('writes window-scoped Search and Today navigation intents', async () => {
    const searchDeps = dependencies(false);
    await executeSidePanelCommand(PANEL_COMMANDS.search, 3, searchDeps);
    expect(searchDeps.setIntent).toHaveBeenCalledWith(3, {
      section: 'search',
      focusTarget: 'search-query',
      requestId: 'request-1',
    });

    const todayDeps = dependencies(false);
    await executeSidePanelCommand(PANEL_COMMANDS.today, 4, todayDeps);
    expect(todayDeps.setIntent).toHaveBeenCalledWith(4, {
      section: 'today',
      requestId: 'request-1',
    });
  });
});

