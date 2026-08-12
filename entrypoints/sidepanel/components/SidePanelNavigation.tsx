import { Icon, type IconName } from './ui/Icon';

export type SidePanelSection = 'park' | 'today' | 'projects' | 'search' | 'review' | 'archive' | 'settings';

const items: Array<{ id: SidePanelSection; label: string; icon: IconName }> = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

interface SidePanelNavigationProps {
  activeSection: SidePanelSection;
  onChange(section: SidePanelSection): void;
}

export function SidePanelNavigation({ activeSection, onChange }: SidePanelNavigationProps) {
  return <nav className="sticky top-[73px] z-30 border-b border-slate-200/80 bg-white/95 px-2 py-2 backdrop-blur" aria-label="LinkShelf sections">
    <div className="flex gap-1 overflow-x-auto pb-0.5">
      {items.map((item) => {
        const isActive = item.id === activeSection;
        return <button key={item.id} type="button" className={isActive ? 'flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800' : 'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800'} aria-pressed={isActive} aria-current={isActive ? 'page' : undefined} onClick={() => onChange(item.id)}><Icon name={item.icon}/>{item.label}</button>;
      })}
    </div>
  </nav>;
}
