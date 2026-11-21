import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_SIDEBAR_PREFERENCES, SIDE_PANEL_INTENTS_KEY, sidebarOpeningSection, type SidebarPreferences, type SidePanelSection } from '@/domain/side-panel';
import { ParkTabsSection } from './components/ParkTabsSection';
import { ProjectsSection } from './components/ProjectsSection';
import { SearchSection } from './components/SearchSection';
import { SIDEBAR_SECTIONS, SidePanelNavigation } from './components/SidePanelNavigation';
import { openManager } from '@/messaging/contracts';
import { TodaySection } from './components/TodaySection';
import { QuickSettings } from './components/QuickSettings';
import { StorageRecoveryGate } from './components/StorageRecovery';
import { RatePromptCard } from './components/RatePromptCard';
import { hasActiveModal } from './components/ui/Modal';
import { consumeWindowIntent, DEFAULT_UI_STATE, loadUiState, UI_STATE_STORAGE_KEY, UiStateSchema, readWindowIntent, updateUiState } from './ui-state';
import { createNavigationIntents } from './navigation-intents';
import type { SavedSessionTarget } from './parking-outcome';
import { useInterfaceTheme } from './use-interface-theme';

function App() {
  const appearance = useInterfaceTheme();
  const [activeSection, setActiveSection] =
    useState<SidePanelSection>(DEFAULT_UI_STATE.lastSection);
  const [sidebar, setSidebar] = useState<SidebarPreferences>(DEFAULT_SIDEBAR_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [searchFocusRequestId, setSearchFocusRequestId] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [savedSession, setSavedSession] = useState<SavedSessionTarget>();
  const [parkProjectId, setParkProjectId] = useState<string>();
  const [manageError, setManageError] = useState('');
  const windowId = useRef<number>(undefined);
  const intents = useRef<ReturnType<typeof createNavigationIntents>>(null);

  useLayoutEffect(() => { window.scrollTo(0, 0); }, [activeSection]);

  const navigate = useCallback((section: SidePanelSection, focusRequestId?: string, session?: SavedSessionTarget, projectId?: string) => {
    setActiveSection(section);
    setSavedSession(session);
    setParkProjectId(projectId);
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
      if (areaName === 'local' && changes[UI_STATE_STORAGE_KEY]) {
        const parsed = UiStateSchema.safeParse(changes[UI_STATE_STORAGE_KEY].newValue);
        if (parsed.success) setSidebar(current => current.startSection === parsed.data.startSection && current.hiddenSections.join() === parsed.data.hiddenSections.join()
          ? current : { startSection: parsed.data.startSection, hiddenSections: parsed.data.hiddenSections });
      }
    }

    browser.storage.onChanged.addListener(onStorageChange);
    void Promise.allSettled([
      loadUiState(),
      browser.windows.getCurrent(),
    ]).then(async ([uiState, currentWindow]) => {
      if (disposed) return;
      if (uiState.status === 'fulfilled') {
        const { startSection, hiddenSections } = uiState.value;
        setSidebar({ startSection, hiddenSections });
        setActiveSection(sidebarOpeningSection({ startSection, hiddenSections }, sidebarSection(uiState.value.lastSection)));
      } else setActiveSection(DEFAULT_UI_STATE.lastSection);
      if (currentWindow.status === 'fulfilled') {
        currentWindowId = currentWindow.value.id;
        windowId.current = currentWindowId;
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

  function manage() {
    setManageError('');
    void openManager('home', windowId.current).then(response => {
      if (!response.success) setManageError(response.error.message);
    }).catch(() => setManageError('LinkShelf could not open the Manager page.'));
  }

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
    <main className="sidebar-workspace min-h-screen bg-[radial-gradient(circle_at_top,#eff6ff_0,#f8fafc_240px)] font-sans text-slate-900">
      <StorageRecoveryGate>
        {ready ? <>
          <div ref={observeShell} className="sidebar-shell sticky top-0 z-40 border-b border-slate-200 bg-white">
            <header className="flex min-h-12 items-center justify-between gap-2 px-3 py-1">
              <div className="flex items-center gap-2">
                <img src="/icon/48.png" alt="" className="size-7 rounded-lg" />
                <h1 className="text-base font-bold tracking-tight">LinkShelf</h1>
              </div>
              <QuickSettings {...appearance} />
            </header>
            <SidePanelNavigation activeSection={activeSection} hiddenSections={sidebar.hiddenSections} onChange={changeSection} onManage={manage} />
            {manageError && <p role="alert" className="mx-3 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{manageError}</p>}
          </div>
          <section className="mx-auto max-w-2xl p-4 pb-10">
            {(activeSection === 'park' || activeSection === 'projects' || activeSection === 'today') && <RatePromptCard />}
            {activeSection === 'park' && <ParkTabsSection initialProjectId={parkProjectId} onViewSession={target => {
              intents.current?.supersede();
              navigate('projects', undefined, target);
            }} />}
            {activeSection === 'today' && <TodaySection />}
            {activeSection === 'projects' && <ProjectsSection savedSession={savedSession} onPark={projectId => {
              intents.current?.supersede();
              navigate('park', undefined, undefined, projectId);
            }} />}
            {activeSection === 'search' && <SearchSection query={searchQuery} onQueryChange={setSearchQuery} focusRequestId={searchFocusRequestId} />}
          </section>
        </> : <p role="status" className="p-4 text-sm text-slate-600">Loading workspace…</p>}
      </StorageRecoveryGate>
    </main>
  );
}

/** Review, Archive and Settings moved to the Manager page; a sidebar last left on one opens Saved. */
function sidebarSection(section: SidePanelSection): SidePanelSection {
  return (SIDEBAR_SECTIONS as readonly SidePanelSection[]).includes(section) ? section : 'projects';
}

function reportNavigationError(error: unknown) {
  console.warn('LinkShelf could not load or save the workspace navigation.', error);
}

export default App;
