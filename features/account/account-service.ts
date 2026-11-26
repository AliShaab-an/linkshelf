import { SIGNED_OUT, toAccountView, type AccountState, type AccountView } from '@/domain/account';
import type { AccountStore } from '@/storage/account-store';
import { AccountApiError, type AccountApi } from './account-api';

export type AccountResult =
  | { success: true; account: AccountView; notice?: string }
  | { success: false; account: AccountView; error: { message: string } };

export interface AccountServiceOptions {
  store: AccountStore;
  /** Null when this build has no backend URL; every call then reports `unavailable`. */
  api: AccountApi | null;
  openTab: (url: string) => Promise<unknown>;
  clientName: () => Promise<string>;
  now?: () => Date;
}

/** Added to the polling interval each time the backend answers slow_down (RFC 8628 §3.5). */
const SLOW_DOWN_SECONDS = 5;

const MESSAGES = {
  denied: 'Sign-in was cancelled on the website.',
  expired: 'The sign-in code expired. Start again to get a new one.',
  invalid: 'This sign-in can no longer be used. Start again.',
  revoked: 'You were signed out because this browser was disconnected from your account.',
  tabFailed: 'LinkShelf could not open the sign-in page. Use “Open sign-in page” to try again.',
  offlineSignOut: 'Signed out on this browser. LinkShelf could not reach your account to disconnect it, so remove it in Connected devices on the website.',
  failed: 'LinkShelf could not complete this account action. Try again.',
};

/**
 * Signs the extension in with the device authorization flow and keeps the account
 * profile and entitlements. All network access and token handling stay in the worker.
 */
export function createAccountService({ store, api, openTab, clientName, now = () => new Date() }: AccountServiceOptions) {
  const unavailable: AccountResult = { success: true, account: { status: 'unavailable' } };
  const ok = (state: AccountState, notice?: string): AccountResult => ({ success: true, account: toAccountView(state), ...(notice ? { notice } : {}) });
  const fail = (state: AccountState, message: string): AccountResult => ({ success: false, account: toAccountView(state), error: { message } });
  const errorMessage = (error: unknown) => error instanceof AccountApiError ? error.message : MESSAGES.failed;
  const at = (seconds: number) => new Date(now().getTime() + seconds * 1000).toISOString();
  const isPast = (iso: string) => Date.parse(iso) <= now().getTime();

  /** Run a change against the stored account; unexpected errors leave it as it was. */
  async function change(step: (state: AccountState, api: AccountApi) => Promise<{ state: AccountState; result: AccountResult }>): Promise<AccountResult> {
    if (!api) return unavailable;
    try {
      return await store.update(state => step(state, api));
    } catch (error) {
      return fail(await store.get().catch(() => SIGNED_OUT), errorMessage(error));
    }
  }

  return {
    async view(): Promise<AccountResult> {
      if (!api) return unavailable;
      return ok(await store.get());
    },

    /** Ask for a sign-in code and open the connect page in a new tab. */
    startSignIn(): Promise<AccountResult> {
      return change(async (state, api) => {
        if (state.status === 'signed_in') return { state, result: ok(state) };
        if (state.status === 'pending' && !isPast(state.pending.expiresAt)) {
          const opened = await openTab(state.pending.verificationUri).then(() => true, () => false);
          return { state, result: opened ? ok(state) : fail(state, MESSAGES.tabFailed) };
        }
        const authorization = await api.startDeviceAuthorization(await clientName());
        const next: AccountState = {
          status: 'pending',
          pending: {
            deviceCode: authorization.deviceCode,
            userCode: authorization.userCode,
            verificationUri: authorization.verificationUriComplete,
            expiresAt: at(authorization.expiresIn),
            interval: authorization.interval,
            nextPollAt: at(authorization.interval),
          },
        };
        const opened = await openTab(authorization.verificationUriComplete).then(() => true, () => false);
        return { state: next, result: opened ? ok(next) : fail(next, MESSAGES.tabFailed) };
      });
    },

    /** Check once whether the sign-in was approved. Calls sooner than the interval do nothing. */
    pollSignIn(): Promise<AccountResult> {
      return change(async (state, api) => {
        if (state.status !== 'pending') return { state, result: ok(state) };
        const { pending } = state;
        if (isPast(pending.expiresAt)) return { state: SIGNED_OUT, result: fail(SIGNED_OUT, MESSAGES.expired) };
        if (!isPast(pending.nextPollAt)) return { state, result: ok(state) };

        let outcome;
        try {
          outcome = await api.pollToken(pending.deviceCode);
        } catch (error) {
          // Keep waiting through a dropped connection; the code is still valid.
          const next: AccountState = { status: 'pending', pending: { ...pending, nextPollAt: at(pending.interval) } };
          return { state: next, result: fail(next, errorMessage(error)) };
        }

        if (outcome.kind === 'token') {
          const next: AccountState = { status: 'signed_in', token: outcome.token, tokenExpiresAt: outcome.tokenExpiresAt, profile: outcome.profile, refreshedAt: now().toISOString() };
          return { state: next, result: ok(next) };
        }
        switch (outcome.error) {
          case 'authorization_pending': {
            const next: AccountState = { status: 'pending', pending: { ...pending, nextPollAt: at(pending.interval) } };
            return { state: next, result: ok(next) };
          }
          case 'slow_down': {
            const interval = pending.interval + SLOW_DOWN_SECONDS;
            const next: AccountState = { status: 'pending', pending: { ...pending, interval, nextPollAt: at(interval) } };
            return { state: next, result: ok(next) };
          }
          case 'access_denied': return { state: SIGNED_OUT, result: fail(SIGNED_OUT, MESSAGES.denied) };
          case 'expired_token': return { state: SIGNED_OUT, result: fail(SIGNED_OUT, MESSAGES.expired) };
          case 'invalid_grant': return { state: SIGNED_OUT, result: fail(SIGNED_OUT, MESSAGES.invalid) };
        }
      });
    },

    /** Open the connect page again for a sign-in that is still waiting. */
    openSignInPage(): Promise<AccountResult> {
      return change(async (state) => {
        if (state.status !== 'pending') return { state, result: ok(state) };
        const opened = await openTab(state.pending.verificationUri).then(() => true, () => false);
        return { state, result: opened ? ok(state) : fail(state, MESSAGES.tabFailed) };
      });
    },

    cancelSignIn(): Promise<AccountResult> {
      return change(async (state) => state.status === 'pending'
        ? { state: SIGNED_OUT, result: ok(SIGNED_OUT) }
        : { state, result: ok(state) });
    },

    /** Reload the plan and entitlements. A revoked or expired token signs this browser out. */
    refresh(): Promise<AccountResult> {
      return change(async (state, api) => {
        if (state.status !== 'signed_in') return { state, result: ok(state) };
        try {
          const profile = await api.getProfile(state.token);
          if (!profile) return { state: SIGNED_OUT, result: ok(SIGNED_OUT, MESSAGES.revoked) };
          const next: AccountState = { ...state, profile, refreshedAt: now().toISOString() };
          return { state: next, result: ok(next) };
        } catch (error) {
          // Keep the last known plan when the backend cannot be reached.
          return { state, result: fail(state, errorMessage(error)) };
        }
      });
    },

    /** Sign this browser out. Local sign-out always completes, even offline. */
    signOut(): Promise<AccountResult> {
      return change(async (state, api) => {
        if (state.status !== 'signed_in') return { state: SIGNED_OUT, result: ok(SIGNED_OUT) };
        const revoked = await api.revokeToken(state.token).then(() => true, () => false);
        return { state: SIGNED_OUT, result: ok(SIGNED_OUT, revoked ? undefined : MESSAGES.offlineSignOut) };
      });
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
