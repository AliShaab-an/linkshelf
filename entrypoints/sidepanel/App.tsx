import { useState } from 'react';
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

function App() {
  const [activeSection, setActiveSection] =
    useState<SidePanelSection>('projects');

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eff6ff_0,#f8fafc_240px)] font-sans text-slate-900">
      <header className="sticky top-0 z-40 flex h-[73px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <img src="/icon/48.png" alt="" className="size-9 rounded-xl shadow-sm" />
          <div><p className="text-[10px] font-extrabold tracking-[0.16em] text-blue-700">LINKSHELF</p><h1 className="text-lg font-bold tracking-tight">Your link workspace</h1></div>
        </div>
        <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-3 text-sm font-bold text-white shadow-sm hover:bg-blue-800" onClick={() => setActiveSection('park')}><Icon name="park"/>Park</button>
      </header>

      <SidePanelNavigation
        activeSection={activeSection}
        onChange={setActiveSection}
      />

      <section className="mx-auto max-w-2xl p-4 pb-10">
        {activeSection === 'park' && <ParkTabsSection />}
        {activeSection === 'today' && <TodaySection />}
        {activeSection === 'projects' && <ProjectsSection />}
        {activeSection === 'archive' && <ArchiveSection />}
        {activeSection === 'search' && <SearchSection />}
        {activeSection === 'review' && <ReviewSection />}
        {activeSection === 'settings' && <SettingsSection />}
      </section>
    </main>
  );
}

export default App;
