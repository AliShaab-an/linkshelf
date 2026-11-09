import { useCallback, useEffect, useRef, useState } from 'react';
import { SIDE_PANEL_INTENTS_KEY, SidePanelSectionSchema, type SidePanelNavigationIntent, type SidePanelSection } from '@/domain/side-panel';
import { openManager } from '@/features/navigation/open-manager';
import { ArchiveSection } from './components/ArchiveSection';
import { ParkTabsSection } from './components/ParkTabsSection';
import { ReviewSection } from './components/ReviewSection';
import { SavedSection } from './components/SavedSection';
import { SettingsSection } from './components/SettingsSection';
import { SidePanelNavigation } from './components/SidePanelNavigation';
import { loadUiState, readWindowIntent, updateUiState } from './ui-state';

export default function App({ isManager = false }: { isManager?: boolean }) {
  const [activeSection, setActiveSection] = useState<SidePanelSection>('park');
  const [searchFocusRequestId, setSearchFocusRequestId] = useState<string>();
  const [initialProjectId, setInitialProjectId] = useState<string>();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement>(null);

  const applyIntent = useCallback((intent: SidePanelNavigationIntent) => {
    setActiveSection(intent.section);
    if (intent.focusTarget === 'search-query') setSearchFocusRequestId(intent.requestId);
    void updateUiState({ lastSection: intent.section }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isManager) {
      const params = new URLSearchParams(window.location.search);
      const section = SidePanelSectionSchema.safeParse(params.get('section'));
      setActiveSection(section.success ? section.data : 'projects');
      setInitialProjectId(params.get('project') || undefined);
      // Consume the opening project so later reloads use the last selected project.
      if (params.has('project')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('project');
        window.history.replaceState(null, '', url);
      }
      setIsReady(true);
      return;
    }

    let disposed = false;
    let currentWindowId: number | undefined;
    async function consumeIntent(value: unknown) {
      if (currentWindowId === undefined || disposed) return;
      const intent = readWindowIntent(value, currentWindowId);
      if (!intent) return;
      applyIntent(intent);
      const stored = await browser.storage.session.get(SIDE_PANEL_INTENTS_KEY);
      const latest = stored[SIDE_PANEL_INTENTS_KEY];
      if (!latest || typeof latest !== 'object') return;
      const intents = { ...latest as Record<string, unknown> };
      if (readWindowIntent(intents, currentWindowId)?.requestId !== intent.requestId) return;
      delete intents[String(currentWindowId)];
      await browser.storage.session.set({ [SIDE_PANEL_INTENTS_KEY]: intents });
    }
    function onStorageChange(changes: Record<string, Browser.storage.StorageChange>, area: string) {
      if (area === 'session' && changes[SIDE_PANEL_INTENTS_KEY]) {
        void consumeIntent(changes[SIDE_PANEL_INTENTS_KEY].newValue).catch(() => undefined);
      }
    }
    browser.storage.onChanged.addListener(onStorageChange);
    void Promise.all([loadUiState(), browser.windows.getCurrent(), browser.storage.session.get(SIDE_PANEL_INTENTS_KEY)])
      .then(async ([uiState, currentWindow, stored]) => {
        if (disposed) return;
        currentWindowId = currentWindow.id;
        // Earlier versions stored management sections as the sidebar's last view.
        setActiveSection(['park', 'projects', 'search', 'today'].includes(uiState.lastSection) ? uiState.lastSection : 'projects');
        await consumeIntent(stored[SIDE_PANEL_INTENTS_KEY]);
      })
      .catch(() => { if (!disposed) setError('Could not restore your last view. You can still use Park tabs and Saved.'); })
      .finally(() => { if (!disposed) setIsReady(true); });
    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(onStorageChange);
    };
  }, [applyIntent, isManager]);

  useEffect(() => { contentRef.current?.scrollTo(0, 0); }, [activeSection]);

  function changeSection(section: SidePanelSection) {
    setActiveSection(section);
    if (section === 'search') setSearchFocusRequestId(crypto.randomUUID());
    if (isManager) {
      const url = new URL(window.location.href);
      url.searchParams.set('section', section);
      window.history.replaceState(null, '', url);
    } else {
      void updateUiState({ lastSection: section }).catch(() => undefined);
    }
  }

  function viewSaved(projectId: string) {
    setInitialProjectId(projectId);
    changeSection('projects');
  }

  async function launchManager() {
    try {
      await openManager(activeSection === 'today' ? 'today' : 'projects');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not open the manager. Try again.');
    }
  }

  const isSaved = ['projects', 'search', 'today'].includes(activeSection);

  return <main className="flex h-dvh min-h-0 flex-col bg-slate-50 font-sans text-slate-900">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2"><img src="/icon/32.png" alt="" className="size-7" /><h1 className="text-base font-bold">LinkShelf{isManager ? ' Manager' : ''}</h1></div>
      {isManager
        ? <button type="button" className="min-h-9 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => changeSection('park')}>Park tabs</button>
        : <button type="button" className="min-h-9 rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={() => void launchManager()}>Open Manager ↗</button>}
    </header>
    <SidePanelNavigation activeSection={activeSection} isManager={isManager} onChange={changeSection} />
    {error && <div className="flex shrink-0 items-start gap-2 bg-red-50 p-3 text-sm text-red-700" role="alert"><p className="flex-1">{error}</p><button type="button" className="font-semibold" onClick={() => setError(null)}>Dismiss</button></div>}
    {!isReady && <p className="p-4 text-sm text-slate-500" role="status">Opening your shelf…</p>}
    {isReady && <section ref={contentRef} className={`min-h-0 flex-1 ${activeSection === 'park' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      <div className={`mx-auto w-full ${isManager ? 'max-w-5xl' : 'max-w-2xl'} ${activeSection === 'park' ? 'h-full' : 'p-4 sm:p-5'}`}>
        {activeSection === 'park' && <ParkTabsSection onViewSaved={viewSaved} />}
        {isSaved && <SavedSection isManager={isManager} showDue={activeSection === 'today'} initialProjectId={initialProjectId} onProjectChange={setInitialProjectId} focusRequestId={searchFocusRequestId} onShowDue={(show) => changeSection(show ? 'today' : 'projects')} onParkTabs={() => changeSection('park')} />}
        {activeSection === 'archive' && <ArchiveSection />}
        {activeSection === 'review' && <ReviewSection />}
        {activeSection === 'settings' && <SettingsSection />}
      </div>
    </section>}
  </main>;
}
