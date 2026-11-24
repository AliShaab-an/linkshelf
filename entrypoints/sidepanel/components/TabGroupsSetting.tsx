import { useCallback, useEffect, useId, useState } from 'react';
import { browser } from 'wxt/browser';
import { TAB_GROUPS_PERMISSION } from '@/domain/tab-groups';

const request = { permissions: [TAB_GROUPS_PERMISSION] };

/**
 * Whether Chrome has granted the optional tab groups permission. The permission itself is the
 * setting: nothing is stored by LinkShelf, and removing it in chrome://extensions turns this off.
 */
export function useTabGroupsPermission() {
  const [granted, setGranted] = useState<boolean>();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setGranted(await browser.permissions.contains(request)); }
    catch { setGranted(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const changed = () => void refresh();
    browser.permissions.onAdded.addListener(changed);
    browser.permissions.onRemoved.addListener(changed);
    return () => {
      browser.permissions.onAdded.removeListener(changed);
      browser.permissions.onRemoved.removeListener(changed);
    };
  }, [refresh]);

  /** Must run straight from the click: Chrome only shows its permission prompt for a user gesture. */
  function change(enabled: boolean) {
    if (working) return;
    setWorking(true);
    setMessage('');
    setError('');
    const done = enabled
      ? browser.permissions.request(request).then(allowed => {
        setMessage(allowed ? 'Tab groups will be kept from now on.' : 'Chrome did not give LinkShelf access, so nothing changed.');
      })
      : browser.permissions.remove(request).then(() => {
        setMessage('LinkShelf will no longer read or recreate tab groups.');
      });
    void done
      .catch(() => setError('Chrome could not change this permission. Nothing changed.'))
      .finally(() => { setWorking(false); void refresh(); });
  }

  return { granted, working, message, error, change };
}

export function TabGroupsSetting() {
  const { granted, working, message, error, change } = useTabGroupsPermission();
  const prefix = useId();
  const locked = working || granted === undefined;

  return <section aria-labelledby={`${prefix}-label`} className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 className="font-semibold text-slate-900">Tab groups</h4>
    <label className={`mt-2 flex min-h-11 items-center justify-between gap-3 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="text-sm font-medium">
        <span id={`${prefix}-label`}>Keep tab groups</span>
        <span id={`${prefix}-help`} className="mt-0.5 block text-xs font-normal text-slate-600">
          Remember which Chrome tab group a tab was in when you park it, and put restored tabs back in that group.
          Chrome asks for permission to read your tab groups. Group names and colours stay on this device.
        </span>
      </span>
      <span className="relative flex h-11 min-w-11 shrink-0 items-center">
        <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 h-full w-full opacity-0"
          aria-labelledby={`${prefix}-label`} aria-describedby={`${prefix}-help`}
          aria-disabled={locked} checked={granted === true}
          onChange={event => { if (!locked) change(event.target.checked); }} />
        <span aria-hidden="true" className="h-6 w-11 rounded-full bg-slate-500 peer-checked:bg-blue-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 peer-aria-disabled:opacity-50" />
        <span aria-hidden="true" className="pointer-events-none absolute start-1 size-4 rounded-full bg-white peer-checked:translate-x-5" />
      </span>
    </label>
    <div role="status" className="text-xs text-slate-600">{working ? 'Waiting for Chrome…' : message}</div>
    {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
  </section>;
}
