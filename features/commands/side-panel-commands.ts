import type { SidePanelNavigationIntent } from '@/domain/side-panel';

export const PANEL_COMMANDS = {
  toggle: 'toggle-side-panel',
  search: 'open-search',
  today: 'open-today',
} as const;

export type PanelCommand = (typeof PANEL_COMMANDS)[keyof typeof PANEL_COMMANDS];

export interface SidePanelCommandDependencies {
  isOpen(windowId: number): boolean | undefined;
  open(windowId: number): Promise<void>;
  close(windowId: number): Promise<void>;
  setIntent(windowId: number, intent: SidePanelNavigationIntent): Promise<void>;
  createRequestId(): string;
}

export function isPanelCommand(command: string): command is PanelCommand {
  return Object.values(PANEL_COMMANDS).includes(command as PanelCommand);
}

export async function executeSidePanelCommand(
  command: PanelCommand,
  windowId: number,
  dependencies: SidePanelCommandDependencies,
): Promise<'opened' | 'closed'> {
  if (command === PANEL_COMMANDS.toggle && dependencies.isOpen(windowId) === true) {
    await dependencies.close(windowId);
    return 'closed';
  }

  const intent = command === PANEL_COMMANDS.search
    ? {
        section: 'search' as const,
        focusTarget: 'search-query' as const,
        requestId: dependencies.createRequestId(),
      }
    : command === PANEL_COMMANDS.today
      ? {
          section: 'today' as const,
          requestId: dependencies.createRequestId(),
        }
      : undefined;

  const intentPromise = intent
    ? dependencies.setIntent(windowId, intent)
    : Promise.resolve();
  const openPromise = dependencies.open(windowId);
  await Promise.all([intentPromise, openPromise]);
  return 'opened';
}

