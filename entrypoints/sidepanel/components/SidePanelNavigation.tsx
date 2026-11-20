import type { SidePanelSection } from '@/domain/side-panel';
import { Icon, type IconName } from './ui/Icon';

interface Destination {
  id: SidePanelSection;
  label: string;
  icon: IconName;
}

/** The daily sections. Review, Archive and Settings live on the Manager page. */
export const SIDEBAR_SECTIONS = ['park', 'projects', 'search', 'today'] as const satisfies readonly SidePanelSection[];

const destinations: Destination[] = [
  { id: 'park', label: 'Park', icon: 'park' },
  { id: 'projects', label: 'Saved', icon: 'folder' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'today', label: 'Today', icon: 'today' },
];

export function SidePanelNavigation({ activeSection, onChange, onManage }: {
  activeSection: SidePanelSection;
  onChange(section: SidePanelSection): void;
  onManage(): void;
}) {
  return <nav className="sidebar-destinations pb-2" aria-label="LinkShelf sections">
    {destinations.map(item => <button key={item.id} type="button" title={item.label}
      className={`sidebar-destination ${activeSection === item.id ? 'bg-blue-700 font-bold text-white' : 'font-medium text-slate-700 hover:bg-slate-100'}`}
      aria-current={activeSection === item.id ? 'page' : undefined}
      onClick={() => onChange(item.id)}>
      <Icon name={item.icon} className="size-4" />
      <span>{item.label}</span>
    </button>)}
    <button type="button" title="Review, Archive, and Settings open in a tab"
      aria-label="Manage" aria-describedby="manage-description"
      className="sidebar-destination font-medium text-slate-700 hover:bg-slate-100"
      onClick={onManage}>
      <Icon name="manage" className="size-4" />
      <span>Manage</span>
      <span id="manage-description" className="sr-only">Opens Review, Archive, and Settings in a tab</span>
    </button>
  </nav>;
}
