import type { SidePanelSection } from '@/domain/side-panel';
import { loadUiState } from '@/entrypoints/sidepanel/ui-state';

export async function openManager(section: SidePanelSection = 'projects'): Promise<void> {
  const state = await loadUiState();
  const url = new URL(browser.runtime.getURL('/manager.html'));
  url.searchParams.set('section', section);
  url.searchParams.set('project', state.selectedProjectId);
  await browser.tabs.create({ url: url.href, active: true });
}
