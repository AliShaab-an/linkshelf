import { useEffect, useState } from 'react';
import { getDomain, isEligibleUrl } from '@/domain/url';
import { ActiveTabCard } from './components/ActiveTabCard';
import { ParkCurrentTabForm } from './components/ParkCurrentTabForm';

interface ActiveTab {
  id: number;
  windowId: number;
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
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (tab?.id === undefined || !tab.url) {
          throw new Error('Chrome did not return an active tab.');
        }
        setActiveTab({
          id: tab.id,
          windowId: tab.windowId,
          title: tab.title || 'Untitled tab',
          domain: getDomain(tab.url),
          isEligible: isEligibleUrl(tab.url),
        });
      })
      .catch(() => setError('LinkShelf could not read this tab.'))
      .finally(() => setIsLoading(false));
  }, []);

  async function openSidePanel() {
    if (!activeTab) return;
    try {
      const sidePanel = getChromeSidePanelApi();
      if (!sidePanel) {
        throw new Error('The Side Panel API is not available in this browser.');
      }
      await sidePanel.open({ windowId: activeTab.windowId });
      window.close();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'LinkShelf could not open the side panel.',
      );
    }
  }

  return (
    <main className="box-border w-[360px] bg-[radial-gradient(circle_at_top,#eff6ff_0,#fff_220px)] p-5 font-sans text-slate-900">
      <header className="mb-5 flex items-center gap-3">
        <img src="/icon/48.png" alt="" className="size-10 rounded-xl shadow-sm" />
        <div><p className="text-[10px] font-extrabold tracking-[0.16em] text-blue-700">LINKSHELF</p><h1 className="text-xl font-bold tracking-tight">Park this tab</h1></div>
      </header>

      {isLoading && <section className="mb-4 rounded-xl bg-slate-100 p-3.5"><p className="font-semibold">Reading current tab...</p></section>}
      {error && <section className="mb-4 rounded-xl bg-red-50 p-3.5 text-red-700" role="alert"><p className="font-semibold">{error}</p></section>}

      {activeTab && (
        <>
          <ActiveTabCard
            title={activeTab.title}
            domain={activeTab.domain}
            isEligible={activeTab.isEligible}
          />
          <ParkCurrentTabForm
            tabId={activeTab.id}
            isEligible={activeTab.isEligible}
          />
          <button type="button" className="mt-2 w-full rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900" onClick={() => void openSidePanel()}>
            Open full LinkShelf →
          </button>
        </>
      )}
    </main>
  );
}

export default App;
