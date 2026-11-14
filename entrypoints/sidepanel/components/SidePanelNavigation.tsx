import type { SidePanelSection } from '@/domain/side-panel';
import { useDisclosure } from './useDisclosure';
import { Icon, type IconName } from './ui/Icon';

interface Destination {
  id: SidePanelSection;
  label: string;
  icon: IconName;
}

const primary: Destination[] = [
  { id: 'park', label: 'Park', icon: 'park' },
  { id: 'projects', label: 'Saved', icon: 'folder' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'today', label: 'Today', icon: 'today' },
];
const secondary: Destination[] = [
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function SidePanelNavigation({ activeSection, onChange }: {
  activeSection: SidePanelSection;
  onChange(section: SidePanelSection): void;
}) {
  const more = useDisclosure();
  const currentSecondary = secondary.find(item => item.id === activeSection);

  return <nav className="sidebar-destinations px-2 pb-2" aria-label="LinkShelf sections">
    {primary.map(item => <button key={item.id} type="button"
      className={`sidebar-destination ${activeSection === item.id ? 'bg-blue-50 font-bold text-blue-800' : 'font-medium text-slate-600 hover:bg-slate-100'}`}
      aria-current={activeSection === item.id ? 'page' : undefined}
      onClick={() => onChange(item.id)}>
      <Icon name={item.icon} />{item.label}
    </button>)}
    <div ref={more.root} onKeyDown={event => {
      if (event.key !== 'Escape' || !more.open) return;
      event.preventDefault();
      event.stopPropagation();
      more.closeAndFocus();
    }}>
      <button ref={more.trigger} type="button"
        className={`sidebar-destination w-full ${currentSecondary ? 'bg-blue-50 font-bold text-blue-800' : 'font-medium text-slate-600 hover:bg-slate-100'}`}
        aria-label={currentSecondary ? `More, current section ${currentSecondary.label}` : 'More'}
        aria-expanded={more.open} aria-controls={more.open ? more.id : undefined} onClick={more.toggle}>
        {currentSecondary ? <span aria-hidden="true" className="text-[11px] font-bold">{currentSecondary.label}</span> : <Icon name="more" />}
        More
      </button>
      {more.open && <div id={more.id} role="group" aria-label="More sections"
        className="sidebar-disclosure dropdown-panel grid gap-1">
        {secondary.map(item => <button key={item.id} type="button"
          className={`dropdown-action ${activeSection === item.id ? 'bg-blue-50 font-bold text-blue-800 hover:bg-blue-50' : ''}`}
          aria-current={activeSection === item.id ? 'page' : undefined}
          onClick={() => { more.closeAndFocus(); onChange(item.id); }}>
          <Icon name={item.icon} />{item.label}
        </button>)}
      </div>}
    </div>
  </nav>;
}
