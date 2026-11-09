import { Icon, type IconName } from './ui/Icon';
import type { SidePanelSection } from '@/domain/side-panel';

export type { SidePanelSection } from '@/domain/side-panel';

const sidebarItems: Array<{ id: SidePanelSection; label: string; icon: IconName }> = [
  { id: 'park', label: 'Park tabs', icon: 'park' },
  { id: 'projects', label: 'Saved', icon: 'folder' },
];
const managerItems: typeof sidebarItems = [
  { id: 'projects', label: 'Saved', icon: 'folder' },
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'settings', label: 'Settings & backup', icon: 'settings' },
];

interface SidePanelNavigationProps {
  activeSection: SidePanelSection;
  isManager?: boolean;
  onChange(section: SidePanelSection): void;
}

export function SidePanelNavigation({ activeSection, isManager = false, onChange }: SidePanelNavigationProps) {
  const selected = activeSection === 'today' || activeSection === 'search' ? 'projects' : activeSection;
  return <nav className="flex shrink-0 flex-wrap gap-1 border-b border-slate-200 bg-white px-3 py-2" aria-label={isManager ? 'Manager sections' : 'LinkShelf sections'}>
    {(isManager ? managerItems : sidebarItems).map((item) => <button key={item.id} type="button" className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${!isManager ? 'flex-1' : ''} ${selected === item.id ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-100'}`} aria-current={selected === item.id ? 'page' : undefined} onClick={() => onChange(item.id)}><Icon name={item.icon} />{item.label}</button>)}
  </nav>;
}
