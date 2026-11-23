import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { managerSectionFromHash, type ManagerSection } from '@/domain/manager';
import { ArchiveSection } from '../sidepanel/components/ArchiveSection';
import { HomeSection } from '../sidepanel/components/HomeSection';
import { LibrarySection } from '../sidepanel/components/LibrarySection';
import { ReviewSection } from '../sidepanel/components/ReviewSection';
import { SettingsSection } from '../sidepanel/components/SettingsSection';
import { StorageRecoveryGate } from '../sidepanel/components/StorageRecovery';
import { Icon, type IconName } from '../sidepanel/components/ui/Icon';
import { hasActiveModal } from '../sidepanel/components/ui/Modal';
import { useInterfaceTheme, type InterfaceTheme } from '../sidepanel/use-interface-theme';

const sections: { id: ManagerSection; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'library', label: 'Library', icon: 'folder' },
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

/** The full-tab Manager page: the less frequent work that does not need to sit in the sidebar. */
function App() {
  const appearance = useInterfaceTheme();
  const [section, setSection] = useState<ManagerSection>(() => managerSectionFromHash(location.hash));

  useEffect(() => {
    const follow = () => setSection(managerSectionFromHash(location.hash));
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${sections.find(item => item.id === section)?.label} · LinkShelf Manager`;
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

  // Each section keeps a comfortable line length, centred in the room beside the navigation.
  const width = section === 'library' ? 'max-w-6xl' : section === 'home' ? 'max-w-4xl' : 'max-w-3xl';
  const current = sections.find(item => item.id === section);

  return <main className="sidebar-workspace min-h-screen bg-slate-50 font-sans text-slate-900 md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
    <StorageRecoveryGate>
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
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
          </a>)}
        </nav>
      </aside>
      <div className="min-w-0">
        <div ref={observeHeader} className="sidebar-shell sticky top-0 z-40 border-b border-slate-200 bg-white">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 md:px-8">
            <span className="text-sm font-medium text-slate-600">{current?.label}</span>
            <div className="flex items-center gap-3">
              <ThemeSwitch appearance={appearance} />
              {/* Room for the signed-in account and its actions. */}
            </div>
          </div>
        </div>
        <section className={`mx-auto ${width} px-4 pt-6 pb-10 md:px-8`}>
          {section === 'home' && <HomeSection />}
          {section === 'library' && <LibrarySection />}
          {section === 'review' && <ReviewSection />}
          {section === 'archive' && <ArchiveSection />}
          {section === 'settings' && <SettingsSection appearance={appearance} />}
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
