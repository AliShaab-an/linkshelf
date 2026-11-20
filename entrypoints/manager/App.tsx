import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { managerSectionFromHash, type ManagerSection } from '@/domain/manager';
import { ArchiveSection } from '../sidepanel/components/ArchiveSection';
import { ReviewSection } from '../sidepanel/components/ReviewSection';
import { SettingsSection } from '../sidepanel/components/SettingsSection';
import { StorageRecoveryGate } from '../sidepanel/components/StorageRecovery';
import { Icon, type IconName } from '../sidepanel/components/ui/Icon';
import { hasActiveModal } from '../sidepanel/components/ui/Modal';
import { useInterfaceTheme } from '../sidepanel/use-interface-theme';

const sections: { id: ManagerSection; label: string; icon: IconName }[] = [
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

  return <main className="sidebar-workspace min-h-screen bg-slate-50 font-sans text-slate-900">
    <StorageRecoveryGate>
      <div ref={observeHeader} className="sidebar-shell sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2">
          <div className="flex items-center gap-2">
            <img src="/icon/48.png" alt="" className="size-7 rounded-lg" />
            <h1 className="text-base font-bold tracking-tight">LinkShelf Manager</h1>
          </div>
          <nav aria-label="Manager sections" className="flex gap-1">
            {sections.map(item => <a key={item.id} href={`#${item.id}`}
              aria-current={section === item.id ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm ${section === item.id ? 'bg-blue-700 font-bold text-white' : 'font-medium text-slate-700 hover:bg-slate-100'}`}
              onClick={event => { if (hasActiveModal()) event.preventDefault(); }}>
              <Icon name={item.icon} className="size-4" />
              {item.label}
            </a>)}
          </nav>
        </div>
      </div>
      <section className="mx-auto max-w-3xl px-4 pt-6 pb-10">
        {section === 'review' && <ReviewSection />}
        {section === 'archive' && <ArchiveSection />}
        {section === 'settings' && <SettingsSection appearance={appearance} />}
      </section>
    </StorageRecoveryGate>
  </main>;
}

export default App;
