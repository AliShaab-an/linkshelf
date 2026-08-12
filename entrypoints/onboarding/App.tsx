import { useState } from 'react';

interface ChromeSidePanelApi {
  open(options: { windowId: number }): Promise<void>;
}

export default function App() {
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const chromeApi = globalThis as typeof globalThis & { chrome?: { sidePanel?: ChromeSidePanelApi } };
      if (tab?.windowId === undefined || !chromeApi.chrome?.sidePanel) {
        throw new Error('Click the LinkShelf toolbar icon to begin.');
      }
      await chromeApi.chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'LinkShelf could not open the side panel.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 font-sans text-slate-900">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-bold tracking-[0.14em] text-blue-700">WELCOME TO LINKSHELF</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Save every link for the right amount of time.</h1>
        <p className="mt-3 text-lg text-slate-600">Park tabs temporarily, return to them with context, and keep only the resources that deserve a permanent bookmark.</p>

        <section className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-lg font-bold">Before you begin</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">When you choose to park a tab, LinkShelf saves its title, URL, project, optional note, and reminder. Unified search reads your Chrome bookmark titles and URLs. This information is used only to provide LinkShelf’s tab parking, search, restoration, bookmark, and reminder features.</p>
          <p className="mt-3 text-sm font-semibold leading-6 text-blue-900">All LinkShelf-owned data remains in Chrome storage on this device. LinkShelf has no account, analytics, advertising, or remote server, and it does not inject scripts into webpages.</p>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Why Chrome asks for permissions</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="font-semibold">Tabs</dt><dd className="mt-1 text-slate-600">Read the tabs you select, then close them only after they are safely stored; restore them later.</dd></div>
            <div><dt className="font-semibold">Bookmarks</dt><dd className="mt-1 text-slate-600">Search native bookmarks and convert a parked link into a bookmark you explicitly request.</dd></div>
            <div><dt className="font-semibold">Storage</dt><dd className="mt-1 text-slate-600">Keep projects, links, notes, reminders, and settings locally.</dd></div>
            <div><dt className="font-semibold">Alarms and notifications</dt><dd className="mt-1 text-slate-600">Schedule reminders you create and display them at the requested time.</dd></div>
          </dl>
        </section>

        {error && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800" role="alert">{error}</p>}
        <button type="button" className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3.5 text-base font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" onClick={() => void begin()}>I understand — open LinkShelf</button>
        <p className="mt-3 text-center text-xs text-slate-500">You control every save, restore, bookmark, archive, removal, export, and import.</p>
      </div>
    </main>
  );
}
