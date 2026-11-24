import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { managerSectionFromHash, type ManagerSection } from '@/domain/manager';
import { ArchiveSection } from '../sidepanel/components/ArchiveSection';
import { HomeSection } from '../sidepanel/components/HomeSection';
import { LibrarySection } from '../sidepanel/components/LibrarySection';
import { ReviewSection } from '../sidepanel/components/ReviewSection';
import { SettingsSection } from '../sidepanel/components/SettingsSection';
import { TrashPanel } from '../sidepanel/components/TrashPanel';
import { SearchSection } from '../sidepanel/components/SearchSection';
import { DuplicatesSection } from '../sidepanel/components/DuplicatesSection';
import { getParkedLinks, getTrash } from '@/messaging/contracts';
import { StorageRecoveryGate } from '../sidepanel/components/StorageRecovery';
import { Icon, type IconName } from '../sidepanel/components/ui/Icon';
import { hasActiveModal } from '../sidepanel/components/ui/Modal';
import { useInterfaceTheme, type InterfaceTheme } from '../sidepanel/use-interface-theme';

const sections: { id: ManagerSection; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'library', label: 'Library', icon: 'folder' },
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'bin', label: 'Bin', icon: 'trash' },
  { id: 'duplicates', label: 'Duplicates', icon: 'copy' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

/** Search is reached from the top bar rather than the navigation. */
const sectionLabel = (section: ManagerSection) => section === 'search' ? 'Search' : sections.find(item => item.id === section)?.label;

/** How many links wait in Review and in the Bin, kept current as the library changes. */
function useNavigationCounts() {
  const [counts, setCounts] = useState<Partial<Record<ManagerSection, number>>>({});
  useEffect(() => {
    let version = 0;
    let timeout: ReturnType<typeof setTimeout>;
    const load = () => {
      const request = ++version;
      void Promise.all([getParkedLinks(), getTrash()]).then(([parked, trash]) => {
        if (request !== version) return;
        setCounts({
          ...(parked.success ? { review: parked.links.length } : {}),
          ...(trash.success ? { bin: trash.links.length } : {}),
        });
      }).catch(() => undefined);
    };
    const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !Object.hasOwn(changes, 'linkshelfDatabase')) return;
      clearTimeout(timeout);
      timeout = setTimeout(load, 200);
    };
    browser.storage.onChanged.addListener(changed);
    load();
    return () => { version++; clearTimeout(timeout); browser.storage.onChanged.removeListener(changed); };
  }, []);
  return counts;
}

/** The full-tab Manager page: the less frequent work that does not need to sit in the sidebar. */
function App() {
  const appearance = useInterfaceTheme();
  const [section, setSection] = useState<ManagerSection>(() => managerSectionFromHash(location.hash));
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const counts = useNavigationCounts();

  function search(value: string) {
    setQuery(value);
    if (section !== 'search' && value.trim()) location.hash = '#search';
  }

  // "/" jumps to the search box from anywhere on the page, as it does in the sidebar.
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || hasActiveModal()) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select, [role="textbox"]'))) return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    const follow = () => setSection(managerSectionFromHash(location.hash));
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${sectionLabel(section)} · LinkShelf Manager`;
  }, [section]);

  // Lists and dropdowns keep clear of the sticky header, as in the sidebar.
  const observeHeader = useCallback((header: HTMLDivElement | null) => {
    if (!header) return;
    const style = document.documentElement.style;
    const measure = () => style.setProperty('--sidebar-shell-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(header);
    return () => {
      observer.disconnect();
      style.removeProperty('--sidebar-shell-height');
    };
  }, []);

  // Pages start right beside the navigation. Library and Home use the whole width; the list pages stop at a readable width.
  const width = section === 'library' || section === 'home' ? '' : 'max-w-5xl';

  return <main className="sidebar-workspace min-h-screen bg-slate-50 font-sans text-slate-900 md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
    <StorageRecoveryGate>
      {/* The aside fills the full height so its border never ends early; its contents stay in view while the page scrolls. */}
      <aside className="border-b border-slate-200 bg-white md:border-r md:border-b-0">
        <div className="md:sticky md:top-0">
        <div className="flex items-center gap-2 px-4 py-3">
          <img src="/icon/48.png" alt="" className="size-7 rounded-lg" />
          <h1 className="text-base font-bold tracking-tight">LinkShelf Manager</h1>
        </div>
        <nav aria-label="Manager sections" className="flex flex-wrap gap-1 px-2 pb-2 md:flex-col md:flex-nowrap md:pb-0">
          {sections.map(item => <a key={item.id} href={`#${item.id}`}
            aria-current={section === item.id ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm ${section === item.id ? 'bg-blue-700 font-bold text-white' : 'font-medium text-slate-700 hover:bg-slate-100'}`}
            onClick={event => { if (hasActiveModal()) event.preventDefault(); }}>
            <Icon name={item.icon} className="size-4" />
            {item.label}
            {counts[item.id] ? <span className={`ml-auto min-w-6 rounded-full px-1.5 text-center text-xs font-semibold ${section === item.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
              <span className="sr-only">, </span>{counts[item.id]}<span className="sr-only"> {item.id === 'bin' ? 'removed' : 'waiting'}</span>
            </span> : null}
          </a>)}
        </nav>
        </div>
      </aside>
      <div className="min-w-0">
        <div ref={observeHeader} className="sidebar-shell sticky top-0 z-40 border-b border-slate-200 bg-white">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 md:px-6">
            <form role="search" className="relative min-w-0 flex-1 sm:max-w-md" onSubmit={event => { event.preventDefault(); search(query); }}>
              <label className="sr-only" htmlFor="manager-search">Search saved links</label>
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
              <input ref={searchInput} id="manager-search" type="search" value={query} placeholder="Search links ( / )"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm" onChange={event => search(event.target.value)} />
            </form>
            <div className="flex shrink-0 items-center gap-3">
              <ThemeSwitch appearance={appearance} />
              {/* Room for the signed-in account and its actions. */}
            </div>
          </div>
        </div>
        <section className={`${width} px-4 pt-6 pb-10 md:px-6`}>
          {section === 'home' && <HomeSection />}
          {section === 'library' && <LibrarySection />}
          {section === 'review' && <ReviewSection />}
          {section === 'archive' && <ArchiveSection />}
          {section === 'bin' && <TrashPanel />}
          {section === 'duplicates' && <DuplicatesSection />}
          {section === 'search' && <SearchSection query={query} onQueryChange={setQuery} externalInput={searchInput} />}
          {section === 'settings' && <SettingsSection />}
        </section>
      </div>
    </StorageRecoveryGate>
  </main>;
}

const themes: { value: InterfaceTheme; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System theme', icon: 'monitor' },
  { value: 'light', label: 'Light theme', icon: 'sun' },
  { value: 'dark', label: 'Dark theme', icon: 'moon' },
];

/** Three icon buttons in the top bar; the same preference the Settings page changes. */
function ThemeSwitch({ appearance }: { appearance: { theme: InterfaceTheme; changeTheme(value: InterfaceTheme): void } }) {
  return <div role="group" aria-label="Theme" className="inline-flex rounded-lg border border-slate-200 p-0.5">
    {themes.map(item => <button key={item.value} type="button" aria-label={item.label} aria-pressed={appearance.theme === item.value} title={item.label}
      className={`inline-flex size-9 items-center justify-center rounded-md ${appearance.theme === item.value ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
      onClick={() => appearance.changeTheme(item.value)}>
      <Icon name={item.icon} className="size-4" />
    </button>)}
  </div>;
}

export default App;
