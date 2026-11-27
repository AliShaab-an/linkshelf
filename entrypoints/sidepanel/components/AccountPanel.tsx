import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCOUNT_FEATURES, ACCOUNT_FEATURE_LABELS, ACCOUNT_STORAGE_KEY, hasAccountFeature, type AccountView } from '@/domain/account';
import { ACCOUNT_API_BASE_URL } from '@/features/account/account-config';
import {
  cancelAccountSignIn,
  getAccount,
  openAccountSignInPage,
  pollAccountSignIn,
  refreshAccount,
  signOutAccount,
  startAccountSignIn,
  startAccountSignUp,
  type AccountResponse,
} from '@/messaging/contracts';
import { OperationFeedback } from './ui/OperationFeedback';
import { buttonClass } from './ui/styles';

/** How often the page asks the worker to check a waiting sign-in; the worker keeps to the server's interval. */
const POLL_EVERY_MS = 2000;

type Busy = 'loading' | 'starting' | 'refreshing' | 'signing-out' | null;

/** Settings › Account: sign in, see the plan and which features it unlocks, and sign out. */
export function AccountPanel() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [busy, setBusy] = useState<Busy>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const apply = useCallback((response: AccountResponse, options: { quiet?: boolean } = {}) => {
    if (!mounted.current) return;
    setAccount(response.account);
    if (!response.success) setError(response.error.message);
    else if (!options.quiet) setError(null);
    if (response.success && response.notice) setMessage(response.notice);
  }, []);

  const run = useCallback(async (kind: Exclude<Busy, null>, action: () => Promise<AccountResponse>, done?: (response: AccountResponse) => void) => {
    setBusy(kind); setError(null); setMessage(null);
    try {
      const response = await action();
      apply(response);
      done?.(response);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'LinkShelf could not complete this account action.');
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    void run('loading', getAccount, (response) => {
      // Pick up plan changes made on the website since the last visit.
      if (response.account.status === 'signed_in') void refreshAccount().then(result => apply(result, { quiet: true })).catch(() => undefined);
    });
    return () => { mounted.current = false; };
  }, [apply, run]);

  // Another page (such as the top bar) may start or finish a sign-in; follow the stored account.
  useEffect(() => {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local' || !Object.hasOwn(changes, ACCOUNT_STORAGE_KEY)) return;
      void getAccount().then(response => apply(response, { quiet: true })).catch(() => undefined);
    };
    browser.storage.onChanged?.addListener(changed);
    return () => browser.storage.onChanged?.removeListener(changed);
  }, [apply]);

  // While a sign-in waits for approval, keep checking; also check as soon as the person comes back to this tab.
  const pending = account?.status === 'pending';
  useEffect(() => {
    if (!pending) return;
    const check = () => {
      void pollAccountSignIn().then((response) => {
        apply(response, { quiet: true });
        if (mounted.current && response.success && response.account.status === 'signed_in') setMessage('Signed in. LinkShelf is connected to your account.');
      }).catch(() => undefined);
    };
    const timer = window.setInterval(check, POLL_EVERY_MS);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, [apply, pending]);

  const pendingText = busy === 'loading' ? 'Loading account…'
    : busy === 'starting' ? 'Opening sign-in…'
    : busy === 'refreshing' ? 'Updating plan…'
    : busy === 'signing-out' ? 'Signing out…'
    : undefined;

  return <>
    <div className="lg:col-span-2"><OperationFeedback pending={pendingText} message={message} error={error} /></div>

    <section aria-labelledby="settings-account-title" className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 id="settings-account-title" className="font-semibold text-slate-900">Your account</h4>

      {account?.status === 'signed_out' && <>
        <p className="mt-2 text-sm text-slate-600">Sign in to use Premium features such as cloud backup. Everything else keeps working on this device without an account.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass('secondary', 'flex-1')} disabled={busy !== null} onClick={() => void run('starting', startAccountSignIn)}>Log in</button>
          <button type="button" className={buttonClass('primary', 'flex-1')} disabled={busy !== null} onClick={() => void run('starting', startAccountSignUp)}>Sign up</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Both open the LinkShelf website in a new tab, where you can also use Google or GitHub. Afterwards, approve this browser there and come back.</p>
      </>}

      {account && account.status !== 'unavailable' && <a className={buttonClass('quiet', 'mt-2 w-full')} href={ACCOUNT_API_BASE_URL ?? undefined} target="_blank" rel="noreferrer">Visit the LinkShelf website</a>}

      {account?.status === 'pending' && <>
        <p className="mt-2 text-sm text-slate-600">Approve this browser in the tab that just opened. Check that the website shows this code:</p>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-center font-mono text-2xl font-bold tracking-[0.2em] text-slate-900" aria-label={`Sign-in code ${account.userCode.split('').join(' ')}`}>{account.userCode}</p>
        <p className="mt-2 text-xs text-slate-500" role="status">Waiting for approval… The code expires at {new Date(account.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass('secondary', 'flex-1')} disabled={busy !== null} onClick={() => void run('starting', openAccountSignInPage)}>Open sign-in page</button>
          <button type="button" className={buttonClass('ghost')} disabled={busy !== null} onClick={() => void run('signing-out', cancelAccountSignIn)}>Cancel</button>
        </div>
      </>}

      {account?.status === 'signed_in' && <>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Name</dt><dd className="truncate font-semibold text-slate-900">{account.profile.name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="truncate font-semibold text-slate-900">{account.profile.email}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className={buttonClass('secondary', 'flex-1')} href={`${ACCOUNT_API_BASE_URL}/settings/profile`} target="_blank" rel="noreferrer">Manage account</a>
          <button type="button" className={buttonClass('danger-outline')} disabled={busy !== null} onClick={() => void run('signing-out', signOutAccount)}>Sign out</button>
        </div>
      </>}
    </section>

    {account?.status === 'signed_in' && <section aria-labelledby="settings-plan-title" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 id="settings-plan-title" className="font-semibold text-slate-900">Plan</h4>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${account.profile.plan === 'premium' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`} data-testid="account-plan">
          {account.profile.plan === 'premium' ? 'Premium' : 'Free'}
        </span>
      </div>
      {account.profile.plan === 'premium' && <p className="mt-1 text-xs text-slate-500">{account.profile.premiumEndsAt ? `Until ${new Date(account.profile.premiumEndsAt).toLocaleDateString()}` : 'No end date'}</p>}
      <ul className="mt-3 space-y-2">
        {ACCOUNT_FEATURES.map(feature => {
          const unlocked = hasAccountFeature(account, feature);
          return <li key={feature} className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={`mt-0.5 font-bold ${unlocked ? 'text-emerald-600' : 'text-slate-400'}`}>{unlocked ? '✓' : '–'}</span>
            <span><span className="font-semibold text-slate-900">{ACCOUNT_FEATURE_LABELS[feature].title}</span>
              <span className="sr-only">{unlocked ? ' (included)' : ' (not included)'}</span>
              <span className="block text-xs text-slate-500">{ACCOUNT_FEATURE_LABELS[feature].description}</span></span>
          </li>;
        })}
      </ul>
      {account.profile.plan === 'free' && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">Premium is coming soon.</p>}
      <p className="mt-3 text-xs text-slate-500">Updated {new Date(account.refreshedAt).toLocaleString()}</p>
      <button type="button" className={buttonClass('quiet', 'mt-2 w-full')} disabled={busy !== null} onClick={() => void run('refreshing', refreshAccount)}>Refresh plan</button>
    </section>}
  </>;
}
