import { useState } from 'react';
import { openManager } from '@/messaging/contracts';
import { Icon } from './ui/Icon';
import { buttonClass } from './ui/styles';
import { SettingsPreferences } from './SettingsPreferences';
import { useDisclosure } from './useDisclosure';
import { useSettingsPreferences } from './useSettingsPreferences';
import { SegmentedControl } from './ui/SegmentedControl';
import type { InterfaceTheme } from '../use-interface-theme';
import type { SettingsPage } from '@/domain/manager';
import { ACCOUNT_API_BASE_URL } from '@/features/account/account-config';

export function QuickSettings({ theme, changeTheme }: { theme: InterfaceTheme; changeTheme(value: InterfaceTheme): void }) {
  const disclosure = useDisclosure();
  const preferences = useSettingsPreferences(disclosure.open);
  const [error, setError] = useState('');

  async function allSettings(page?: SettingsPage) {
    setError('');
    try {
      const response = await openManager('settings', (await browser.windows.getCurrent()).id, page);
      if (!response.success) setError(response.error.message);
    } catch { setError('LinkShelf could not open the Manager page.'); }
  }

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
      <h2 className="mb-2 font-semibold text-slate-900">Quick settings</h2>
      <SettingsPreferences preferences={preferences} compact />
      <div className="mt-2 border-t border-slate-200 pt-2 text-sm font-medium">
        <span id="quick-theme-label">Theme</span>
        <SegmentedControl className="mt-1" aria-labelledby="quick-theme-label" value={theme} onChange={changeTheme}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] satisfies { value: InterfaceTheme; label: string }[]} />
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {ACCOUNT_API_BASE_URL && <button type="button" className={buttonClass('secondary', 'mt-2 w-full')} onClick={() => void allSettings('account')}>
        Account: log in or sign up
      </button>}
      <button type="button" className={buttonClass('quiet', 'mt-2 w-full')} onClick={() => void allSettings()}>
        <Icon name="manage" className="size-4" />All settings
      </button>
    </div>}
  </div>;
}
