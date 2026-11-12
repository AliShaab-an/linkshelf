import { useCallback, useEffect, useState } from 'react';
import { SIDE_PANEL_INTENTS_KEY, type SidePanelNavigationIntent } from '@/domain/side-panel';
import { ArchiveSection } from './components/ArchiveSection';
import { ParkTabsSection } from './components/ParkTabsSection';
import { ProjectsSection } from './components/ProjectsSection';
import { SearchSection } from './components/SearchSection';
import { ReviewSection } from './components/ReviewSection';
import { SettingsSection } from './components/SettingsSection';
import {
  SidePanelNavigation,
  type SidePanelSection,
} from './components/SidePanelNavigation';
import { TodaySection } from './components/TodaySection';
import { Icon } from './components/ui/Icon';
import { QuickSettings } from './components/QuickSettings';
import { StorageRecoveryGate } from './components/StorageRecovery';
import { hasActiveModal } from './components/ui/Modal';
import { loadUiState, readWindowIntent, updateUiState } from './ui-state';

function App() {
  const [activeSection, setActiveSection] =
    useState<SidePanelSection>('projects');
  const [searchFocusRequestId, setSearchFocusRequestId] = useState<string>();

  const applyIntent = useCallback((intent: SidePanelNavigationIntent) => {
    setActiveSection(intent.section);
    if (intent.focusTarget === 'search-query') {
      setSearchFocusRequestId(intent.requestId);
    }
    void updateUiState({ lastSection: intent.section });
  }, []);

  useEffect(() => {
    let disposed = false;
    let currentWindowId: number | undefined;
    let lastHandledRequestId: string | undefined;

    async function consumeIntent(value: unknown) {
      if (currentWindowId === undefined) return;
      const intent = readWindowIntent(value, currentWindowId);
      if (!intent || disposed) return;
      const blockedOnReceipt = hasActiveModal();
      const stored = await browser.storage.session.get(SIDE_PANEL_INTENTS_KEY);
      const latest = stored[SIDE_PANEL_INTENTS_KEY];
      if (!latest || typeof latest !== 'object') return;
      const intents = { ...latest as Record<string, unknown> };
      const candidate = readWindowIntent(intents, currentWindowId);
      if (disposed || candidate?.requestId !== intent.requestId) return;
      const alreadyHandled = intent.requestId === lastHandledRequestId;
      lastHandledRequestId = intent.requestId;
      if (!alreadyHandled && !blockedOnReceipt && !hasActiveModal()) applyIntent(intent);
      delete intents[String(currentWindowId)];
      await browser.storage.session.set({ [SIDE_PANEL_INTENTS_KEY]: intents });
    }

    function onStorageChange(
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) {
      if (areaName === 'session' && changes[SIDE_PANEL_INTENTS_KEY]) {
        void consumeIntent(changes[SIDE_PANEL_INTENTS_KEY].newValue);
      }
    }

    browser.storage.onChanged.addListener(onStorageChange);
    void Promise.all([
      loadUiState(),
      browser.windows.getCurrent(),
      browser.storage.session.get(SIDE_PANEL_INTENTS_KEY),
    ]).then(([uiState, currentWindow, stored]) => {
      if (disposed) return;
      currentWindowId = currentWindow.id;
      setActiveSection(uiState.lastSection);
      return consumeIntent(stored[SIDE_PANEL_INTENTS_KEY]);
    });

    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(onStorageChange);
    };
  }, [applyIntent]);

  function changeSection(section: SidePanelSection) {
    setActiveSection(section);
    void updateUiState({ lastSection: section });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eff6ff_0,#f8fafc_240px)] font-sans text-slate-900">
      <header className="sticky top-0 z-40 flex h-[73px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <img src="/icon/48.png" alt="" className="size-9 rounded-xl shadow-sm" />
          <div><p className="text-[10px] font-extrabold tracking-[0.16em] text-blue-700">LINKSHELF</p><h1 className="text-lg font-bold tracking-tight">Your link workspace</h1></div>
        </div>
        <div className="flex items-center gap-2"><QuickSettings /><button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-3 text-sm font-bold text-white shadow-sm hover:bg-blue-800" onClick={() => changeSection('park')}><Icon name="park"/>Park</button></div>
      </header>

      <SidePanelNavigation
        activeSection={activeSection}
        onChange={changeSection}
      />

      <section className="mx-auto max-w-2xl p-4 pb-10">
        <StorageRecoveryGate>
        {activeSection === 'park' && <ParkTabsSection />}
        {activeSection === 'today' && <TodaySection />}
        {activeSection === 'projects' && <ProjectsSection />}
        {activeSection === 'archive' && <ArchiveSection />}
        {activeSection === 'search' && <SearchSection focusRequestId={searchFocusRequestId} />}
        {activeSection === 'review' && <ReviewSection />}
        {activeSection === 'settings' && <SettingsSection />}
        </StorageRecoveryGate>
      </section>
    </main>
  );
}

export default App;
