import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SIDE_PANEL_INTENTS_KEY, type SidePanelSection } from '@/domain/side-panel';
import { ArchiveSection } from './components/ArchiveSection';
import { ParkTabsSection } from './components/ParkTabsSection';
import { ProjectsSection } from './components/ProjectsSection';
import { SearchSection } from './components/SearchSection';
import { ReviewSection } from './components/ReviewSection';
import { SettingsSection } from './components/SettingsSection';
import { SidePanelNavigation } from './components/SidePanelNavigation';
import { TodaySection } from './components/TodaySection';
import { QuickSettings } from './components/QuickSettings';
import { StorageRecoveryGate } from './components/StorageRecovery';
import { hasActiveModal } from './components/ui/Modal';
import { consumeWindowIntent, DEFAULT_UI_STATE, loadUiState, readWindowIntent, updateUiState } from './ui-state';
import { createNavigationIntents } from './navigation-intents';

function App() {
  const [activeSection, setActiveSection] =
    useState<SidePanelSection>(DEFAULT_UI_STATE.lastSection);
  const [ready, setReady] = useState(false);
  const [searchFocusRequestId, setSearchFocusRequestId] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const intents = useRef<ReturnType<typeof createNavigationIntents>>(null);

  useLayoutEffect(() => { window.scrollTo(0, 0); }, [activeSection]);

  const navigate = useCallback((section: SidePanelSection, focusRequestId?: string) => {
    setActiveSection(section);
    setSearchFocusRequestId(focusRequestId);
    void updateUiState({ lastSection: section }).catch(reportNavigationError);
  }, []);

  useEffect(() => {
    let disposed = false;
    let currentWindowId: number | undefined;
    const consumer = createNavigationIntents({
      consume: (id, isMounted) => currentWindowId === undefined
        ? Promise.resolve(false) : consumeWindowIntent(currentWindowId, id, isMounted),
      blocked: hasActiveModal,
      apply: intent => navigate(intent.section, intent.focusTarget === 'search-query' ? intent.requestId : undefined),
    });
    intents.current = consumer;

    function receive(value: unknown) {
      if (disposed || currentWindowId === undefined) return;
      const intent = readWindowIntent(value, currentWindowId);
      if (intent) return consumer.receive(intent).catch(reportNavigationError);
    }

    function onStorageChange(
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) {
      if (areaName === 'session' && changes[SIDE_PANEL_INTENTS_KEY]) {
        void receive(changes[SIDE_PANEL_INTENTS_KEY].newValue);
      }
    }

    browser.storage.onChanged.addListener(onStorageChange);
    void Promise.allSettled([
      loadUiState(),
      browser.windows.getCurrent(),
    ]).then(async ([uiState, currentWindow]) => {
      if (disposed) return;
      setActiveSection(uiState.status === 'fulfilled' ? uiState.value.lastSection : DEFAULT_UI_STATE.lastSection);
      if (currentWindow.status === 'fulfilled') {
        currentWindowId = currentWindow.value.id;
        try {
          const stored = await browser.storage.session.get(SIDE_PANEL_INTENTS_KEY);
          await receive(stored[SIDE_PANEL_INTENTS_KEY]);
        } catch (error) { reportNavigationError(error); }
      }
      if (!disposed) setReady(true);
    });

    return () => {
      disposed = true;
      consumer.dispose();
      intents.current = null;
      browser.storage.onChanged.removeListener(onStorageChange);
    };
  }, [navigate]);

  function changeSection(section: SidePanelSection) {
    if (hasActiveModal()) return;
    intents.current?.supersede();
    navigate(section, section === 'search' ? crypto.randomUUID() : undefined);
  }

  const observeShell = useCallback((shell: HTMLDivElement | null) => {
    if (!shell) return;
    const style = document.documentElement.style;
    const measure = () => style.setProperty('--sidebar-shell-height', `${shell.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(shell);
    return () => {
      observer.disconnect();
      style.removeProperty('--sidebar-shell-height');
    };
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eff6ff_0,#f8fafc_240px)] font-sans text-slate-900">
      <StorageRecoveryGate>
        {ready ? <>
          <div ref={observeShell} className="sidebar-shell sticky top-0 z-40 border-b border-slate-200 bg-white">
            <header className="flex min-h-12 items-center justify-between gap-2 px-3 py-1">
              <div className="flex items-center gap-2">
                <img src="/icon/48.png" alt="" className="size-7 rounded-lg" />
                <h1 className="text-base font-bold tracking-tight">LinkShelf</h1>
              </div>
              <QuickSettings />
            </header>
            <SidePanelNavigation activeSection={activeSection} onChange={changeSection} />
          </div>
          <section className="mx-auto max-w-2xl p-4 pb-10">
            {activeSection === 'park' && <ParkTabsSection />}
            {activeSection === 'today' && <TodaySection />}
            {activeSection === 'projects' && <ProjectsSection />}
            {activeSection === 'archive' && <ArchiveSection />}
            {activeSection === 'search' && <SearchSection query={searchQuery} onQueryChange={setSearchQuery} focusRequestId={searchFocusRequestId} />}
            {activeSection === 'review' && <ReviewSection />}
            {activeSection === 'settings' && <SettingsSection />}
          </section>
        </> : <p role="status" className="p-4 text-sm text-slate-600">Loading workspace…</p>}
      </StorageRecoveryGate>
    </main>
  );
}

function reportNavigationError(error: unknown) {
  console.warn('LinkShelf could not load or save the workspace navigation.', error);
}

export default App;
