import { useState } from 'react';
import { startAccountSignIn, startAccountSignUp, type AccountResponse } from '@/messaging/contracts';
import { buttonClass } from './ui/styles';
import { useAccountView } from './useAccountView';

const ACCOUNT_PAGE = '#settings/account';

/**
 * The Manager top bar's account area: Log in and Sign up while signed out (both open the
 * LinkShelf website and connect this browser), otherwise the account and its plan.
 */
export function AccountTopBar() {
  const { account } = useAccountView();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!account || account.status === 'unavailable') return null;

  async function start(action: () => Promise<AccountResponse>) {
    setBusy(true); setError('');
    try {
      const response = await action();
      if (!response.success) setError(response.error.message);
      // The Account page shows the code to check and waits for approval.
      location.hash = ACCOUNT_PAGE;
    } catch {
      setError('LinkShelf could not open the website. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (account.status === 'signed_out') {
    return <div className="flex items-center gap-2">
      {error && <p role="alert" className="sr-only">{error}</p>}
      <button type="button" className={buttonClass('secondary', 'min-h-9 px-3')} disabled={busy} title={error || undefined}
        onClick={() => void start(startAccountSignIn)}>Log in</button>
      <button type="button" className={buttonClass('primary', 'min-h-9 px-3')} disabled={busy}
        onClick={() => void start(startAccountSignUp)}>Sign up</button>
    </div>;
  }

  if (account.status === 'pending') {
    return <a href={ACCOUNT_PAGE} className={buttonClass('secondary', 'min-h-9 px-3')}>Finish signing in</a>;
  }

  const { name, plan } = account.profile;
  const initials = name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <a href={ACCOUNT_PAGE} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-100"
    aria-label={`Account: ${name}, ${plan === 'premium' ? 'Premium' : 'Free'} plan`}>
    <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">{initials}</span>
    <span className="hidden max-w-40 truncate font-semibold text-slate-800 sm:inline">{name}</span>
    <span aria-hidden="true" className={`rounded-full px-2 py-0.5 text-xs font-bold ${plan === 'premium' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>
      {plan === 'premium' ? 'Premium' : 'Free'}
    </span>
  </a>;
}
