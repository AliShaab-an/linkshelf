import { Icon } from './ui/Icon';
import { SettingsPreferences } from './SettingsPreferences';
import { useDisclosure } from './useDisclosure';
import { useSettingsPreferences } from './useSettingsPreferences';
import { Select } from './ui/Select';
import type { InterfaceTheme } from '../use-interface-theme';

export function QuickSettings({ theme, changeTheme }: { theme: InterfaceTheme; changeTheme(value: InterfaceTheme): void }) {
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
      <label className="mt-2 block border-t border-slate-200 pt-2 text-sm font-medium">
        Theme
        <Select className="mt-1 w-full" value={theme} onChange={event => changeTheme(event.target.value as InterfaceTheme)}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </Select>
      </label>
    </div>}
  </div>;
}
