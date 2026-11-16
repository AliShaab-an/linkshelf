import { useEffect, useState } from 'react';
import { getDomain, isEligibleUrl } from '@/domain/url';
import { ActiveTabCard } from './components/ActiveTabCard';
import { ParkCurrentTabForm } from './components/ParkCurrentTabForm';
import { useInterfaceTheme } from '../sidepanel/use-interface-theme';

interface ActiveTab {
  id: number;
  title: string;
  domain: string;
  isEligible: boolean;
}

interface ChromeSidePanelApi {
  open(options: { windowId: number }): Promise<void>;
}

function getChromeSidePanelApi(): ChromeSidePanelApi | undefined {
  const chromeGlobal = globalThis as typeof globalThis & {
    chrome?: { sidePanel?: ChromeSidePanelApi };
  };
  return chromeGlobal.chrome?.sidePanel;
}

function App() {
  useInterfaceTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [windowId, setWindowId] = useState<number>();
  const [isLoading, setIsLoading] = useState(true);
  const [openingSidebar, setOpeningSidebar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        setWindowId(tab?.windowId);
        if (tab?.id === undefined || !tab.url) {
          throw new Error('Chrome did not return an active tab.');
        }
        setActiveTab({
          id: tab.id,
          title: tab.title || 'Untitled tab',
          domain: getDomain(tab.url),
          isEligible: isEligibleUrl(tab.url),
        });
      })
      .catch(() => setError('LinkShelf could not read this tab.'))
      .finally(() => setIsLoading(false));
  }, []);

  async function openSidePanel() {
    if (openingSidebar) return;
    setOpeningSidebar(true);
    setSidebarError(null);
    try {
      const sidePanel = getChromeSidePanelApi();
      if (!sidePanel) {
        throw new Error('The Side Panel API is not available in this browser.');
      }
      if (windowId === undefined) throw new Error('Chrome could not identify this window.');
      await sidePanel.open({ windowId });
      window.close();
    } catch (caughtError) {
      setSidebarError(
        caughtError instanceof Error
          ? caughtError.message
          : 'LinkShelf could not open the side panel.',
      );
    } finally { setOpeningSidebar(false); }
  }

  return (
    <main className="box-border w-[360px] max-w-full bg-slate-50 p-4 font-sans text-slate-900">
      <header className="mb-3 flex items-center gap-2.5">
        <img src="/icon/48.png" alt="" className="size-8 rounded-lg" />
        <h1 className="text-base font-bold">Park this tab</h1>
      </header>

      {isLoading && <p role="status" className="text-sm text-slate-600">Reading current tab…</p>}
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800" role="alert">{error}</p>}

      {activeTab && (
        <>
          <ActiveTabCard
            title={activeTab.title}
            domain={activeTab.domain}
            isEligible={activeTab.isEligible}
          />
          {activeTab.isEligible && <ParkCurrentTabForm tabId={activeTab.id} />}
        </>
      )}
      {windowId !== undefined && <>
        <button type="button" className="mt-2 min-h-10 w-full rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          disabled={openingSidebar} onClick={() => void openSidePanel()}>
          {openingSidebar ? 'Opening sidebar…' : 'Open sidebar'}
        </button>
        {sidebarError && <p className="mt-1 text-sm text-red-800" role="alert">{sidebarError}</p>}
      </>}
    </main>
  );
}

export default App;
