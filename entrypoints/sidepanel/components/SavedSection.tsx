import { useEffect, useState } from 'react';
import { getDueReminderLinks } from '@/messaging/contracts';
import { DATABASE_STORAGE_KEY } from '@/storage/repository';
import { ProjectsSection } from './ProjectsSection';
import { SearchSection } from './SearchSection';
import { TodaySection } from './TodaySection';

interface SavedSectionProps {
  isManager: boolean;
  showDue: boolean;
  focusRequestId?: string;
  initialProjectId?: string;
  onProjectChange(projectId: string): void;
  onShowDue(show: boolean): void;
  onParkTabs(): void;
}

export function SavedSection({ isManager, showDue, focusRequestId, initialProjectId, onProjectChange, onShowDue, onParkTabs }: SavedSectionProps) {
  const [dueCount, setDueCount] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const response = await getDueReminderLinks();
        if (response.success && !disposed) setDueCount(response.links.length);
      } catch {
        // The reminders view displays actionable loading errors.
      }
    }
    function onChange(changes: Record<string, Browser.storage.StorageChange>, area: string) {
      if (area === 'local' && changes[DATABASE_STORAGE_KEY]) void refresh();
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    browser.storage.onChanged.addListener(onChange);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      browser.storage.onChanged.removeListener(onChange);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold">Saved</h2>
      <button type="button" className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold ${showDue ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`} aria-pressed={showDue} onClick={() => onShowDue(!showDue)}>Due today{dueCount !== null ? ` (${dueCount})` : ''}</button>
    </div>
    <SearchSection embedded focusRequestId={focusRequestId} browseView={showDue ? 'today' : 'projects'}>
      {showDue
        ? <><button type="button" className="mb-3 text-sm font-semibold text-blue-700" onClick={() => onShowDue(false)}>← Back to projects</button><TodaySection /></>
        : <ProjectsSection isManager={isManager} initialProjectId={initialProjectId} onProjectChange={onProjectChange} onParkTabs={onParkTabs} />}
    </SearchSection>
  </>;
}
