import type { SidePanelSection } from '@/domain/side-panel';
import { Icon, type IconName } from './ui/Icon';

interface Destination {
  id: SidePanelSection;
  label: string;
  icon: IconName;
}

const destinations: Destination[] = [
  { id: 'park', label: 'Park', icon: 'park' },
  { id: 'projects', label: 'Saved', icon: 'folder' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function SidePanelNavigation({ activeSection, onChange }: {
  activeSection: SidePanelSection;
  onChange(section: SidePanelSection): void;
}) {
  return <nav className="sidebar-destinations pb-2" aria-label="LinkShelf sections">
    {destinations.map(item => <button key={item.id} type="button" title={item.label}
      className={`sidebar-destination ${activeSection === item.id ? 'bg-blue-700 font-bold text-white' : 'font-medium text-slate-700 hover:bg-slate-100'}`}
      aria-current={activeSection === item.id ? 'page' : undefined}
      onClick={() => onChange(item.id)}>
      <Icon name={item.icon} className="size-4" />
      <span>{item.label}</span>
    </button>)}
  </nav>;
}
