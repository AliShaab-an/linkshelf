import { Icon } from './ui/Icon';
import { SettingsPreferences } from './SettingsPreferences';
import { useDisclosure } from './useDisclosure';
import { useSettingsPreferences } from './useSettingsPreferences';

export function QuickSettings() {
  const disclosure = useDisclosure();
  const preferences = useSettingsPreferences(disclosure.open);

  return <div ref={disclosure.root} onKeyDown={event => {
    if (event.key !== 'Escape' || !disclosure.open) return;
    event.preventDefault();
    event.stopPropagation();
    disclosure.closeAndFocus();
  }}>
    <button ref={disclosure.trigger} type="button" className="dropdown-trigger" aria-label="Quick settings"
      aria-expanded={disclosure.open} aria-controls={disclosure.open ? disclosure.id : undefined}
      onClick={disclosure.toggle}><Icon name="settings" /></button>
    {disclosure.open && <div id={disclosure.id} role="group" aria-label="Quick settings" className="sidebar-disclosure dropdown-panel">
      <h2 className="mb-2 font-bold">Quick settings</h2>
      <SettingsPreferences preferences={preferences} compact />
    </div>}
  </div>;
}
