import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_STORAGE_KEY, type AccountProfile } from '@/domain/account';
import { AccountStore } from '@/storage/account-store';
import type { StorageAdapter } from '@/storage/storage-adapter';
import { LinkShelfRepository } from '@/storage/repository';
import { AccountApiError, type AccountApi } from './account-api';
import { createAccountService } from './account-service';

class MemoryStorage implements StorageAdapter {
  values: Record<string, unknown> = {};
  async get(key: string) { return structuredClone(this.values[key]); }
  async set(key: string, value: unknown) { this.values[key] = structuredClone(value); }
}

const profile: AccountProfile = {
  id: 1, name: 'Test Person', email: 'person@example.test', emailVerified: true,
  plan: 'free', premiumEndsAt: null, entitlements: { cloud_backup: false, shared_collections: false, sync: false },
};

describe('account service', () => {
  let storage: MemoryStorage;
  let api: { [K in keyof AccountApi]: ReturnType<typeof vi.fn<AccountApi[K]>> };
  let openTab: ReturnType<typeof vi.fn<(url: string) => Promise<unknown>>>;
  let clock: Date;

  function service(withApi = true) {
    return createAccountService({
      store: new AccountStore(storage),
      api: withApi ? api : null,
      openTab,
      clientName: async () => 'LinkShelf on Chrome (Windows)',
      now: () => clock,
    });
  }
  const advance = (seconds: number) => { clock = new Date(clock.getTime() + seconds * 1000); };

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new Date('2026-11-27T10:00:00.000Z');
    openTab = vi.fn<(url: string) => Promise<unknown>>(async () => ({ id: 1 }));
    api = {
      startDeviceAuthorization: vi.fn<AccountApi['startDeviceAuthorization']>(async () => ({
        deviceCode: 'secret-device-code', userCode: 'BCDF-GHJK',
        verificationUriComplete: 'https://linkshelf.test/extension/connect?code=BCDF-GHJK', expiresIn: 600, interval: 5,
      })),
      pollToken: vi.fn<AccountApi['pollToken']>(async () => ({ kind: 'error', error: 'authorization_pending' })),
      getProfile: vi.fn<AccountApi['getProfile']>(async () => profile),
      revokeToken: vi.fn<AccountApi['revokeToken']>(async () => undefined),
    };
  });

  it('reports unavailable when the build has no backend', async () => {
    const accounts = service(false);

    await expect(accounts.view()).resolves.toEqual({ success: true, account: { status: 'unavailable' } });
    await expect(accounts.startSignIn()).resolves.toEqual({ success: true, account: { status: 'unavailable' } });
    expect(storage.values).toEqual({});
  });

  it('signs in through the device flow and keeps the token out of every response', async () => {
    const accounts = service();

    const started = await accounts.startSignIn();
    expect(started).toEqual({ success: true, account: {
      status: 'pending', userCode: 'BCDF-GHJK',
      verificationUri: 'https://linkshelf.test/extension/connect?code=BCDF-GHJK',
      expiresAt: '2026-11-27T10:10:00.000Z',
    } });
    expect(api.startDeviceAuthorization).toHaveBeenCalledWith('LinkShelf on Chrome (Windows)');
    expect(openTab).toHaveBeenCalledWith('https://linkshelf.test/extension/connect?code=BCDF-GHJK');

    // Too soon: no request is sent.
    await accounts.pollSignIn();
    expect(api.pollToken).not.toHaveBeenCalled();

    advance(5);
    await expect(accounts.pollSignIn()).resolves.toMatchObject({ success: true, account: { status: 'pending' } });
    expect(api.pollToken).toHaveBeenCalledWith('secret-device-code');

    api.pollToken.mockResolvedValueOnce({ kind: 'token', token: '1|secret-token', tokenExpiresAt: '2027-11-27T10:00:00+00:00', profile });
    advance(5);
    const signedIn = await accounts.pollSignIn();

    expect(signedIn).toEqual({ success: true, account: { status: 'signed_in', profile, refreshedAt: clock.toISOString() } });
    expect(JSON.stringify(signedIn)).not.toContain('secret');
    expect(storage.values[ACCOUNT_STORAGE_KEY]).toMatchObject({ status: 'signed_in', token: '1|secret-token' });
  });

  it('waits longer after slow_down', async () => {
    const accounts = service();
    await accounts.startSignIn();
    api.pollToken.mockResolvedValueOnce({ kind: 'error', error: 'slow_down' });

    advance(5);
    await accounts.pollSignIn();
    advance(5);
    await accounts.pollSignIn();
    expect(api.pollToken).toHaveBeenCalledTimes(1);

    advance(5);
    await accounts.pollSignIn();
    expect(api.pollToken).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['access_denied', 'cancelled'],
    ['expired_token', 'expired'],
    ['invalid_grant', 'can no longer be used'],
  ] as const)('stops and explains when the server answers %s', async (error, text) => {
    const accounts = service();
    await accounts.startSignIn();
    api.pollToken.mockResolvedValueOnce({ kind: 'error', error });

    advance(5);
    const result = await accounts.pollSignIn();

    expect(result.success).toBe(false);
    expect(result.account).toEqual({ status: 'signed_out' });
    if (!result.success) expect(result.error.message).toContain(text);
  });

  it('expires a waiting sign-in on its own without asking the server', async () => {
    const accounts = service();
    await accounts.startSignIn();

    advance(601);
    const result = await accounts.pollSignIn();

    expect(result).toMatchObject({ success: false, account: { status: 'signed_out' } });
    expect(api.pollToken).not.toHaveBeenCalled();
  });

  it('keeps waiting through a dropped connection', async () => {
    const accounts = service();
    await accounts.startSignIn();
    api.pollToken.mockRejectedValueOnce(new AccountApiError('LinkShelf could not reach your account.'));

    advance(5);
    const result = await accounts.pollSignIn();

    expect(result).toMatchObject({ success: false, account: { status: 'pending' }, error: { message: 'LinkShelf could not reach your account.' } });
  });

  it('keeps the code when the sign-in tab cannot open, and can open it again', async () => {
    openTab.mockRejectedValueOnce(new Error('No window'));
    const accounts = service();

    const started = await accounts.startSignIn();
    expect(started).toMatchObject({ success: false, account: { status: 'pending' } });

    await expect(accounts.openSignInPage()).resolves.toMatchObject({ success: true, account: { status: 'pending' } });
    expect(openTab).toHaveBeenCalledTimes(2);
    // Starting again while the code is valid reuses it instead of asking for a new one.
    await accounts.startSignIn();
    expect(api.startDeviceAuthorization).toHaveBeenCalledTimes(1);
  });

  it('cancels a waiting sign-in', async () => {
    const accounts = service();
    await accounts.startSignIn();

    await expect(accounts.cancelSignIn()).resolves.toEqual({ success: true, account: { status: 'signed_out' } });
  });

  async function signedIn() {
    const accounts = service();
    await accounts.startSignIn();
    api.pollToken.mockResolvedValueOnce({ kind: 'token', token: '1|secret-token', tokenExpiresAt: null, profile });
    advance(5);
    await accounts.pollSignIn();
    return accounts;
  }

  it('refreshes the plan and entitlements', async () => {
    const accounts = await signedIn();
    api.getProfile.mockResolvedValueOnce({ ...profile, plan: 'premium', entitlements: { cloud_backup: true, shared_collections: true, sync: true } });

    const result = await accounts.refresh();

    expect(api.getProfile).toHaveBeenCalledWith('1|secret-token');
    expect(result).toMatchObject({ success: true, account: { status: 'signed_in', profile: { plan: 'premium', entitlements: { sync: true } } } });
  });

  it('signs out locally when the token was revoked on the website', async () => {
    const accounts = await signedIn();
    api.getProfile.mockResolvedValueOnce(null);

    const result = await accounts.refresh();

    expect(result).toMatchObject({ success: true, account: { status: 'signed_out' }, notice: expect.stringContaining('disconnected') });
    expect(storage.values[ACCOUNT_STORAGE_KEY]).toEqual({ status: 'signed_out' });
  });

  it('keeps the last known plan when refreshing offline', async () => {
    const accounts = await signedIn();
    api.getProfile.mockRejectedValueOnce(new AccountApiError('LinkShelf could not reach your account.'));

    await expect(accounts.refresh()).resolves.toMatchObject({ success: false, account: { status: 'signed_in', profile: { plan: 'free' } } });
  });

  it('revokes the token when signing out, and still signs out offline', async () => {
    let accounts = await signedIn();
    await expect(accounts.signOut()).resolves.toEqual({ success: true, account: { status: 'signed_out' } });
    expect(api.revokeToken).toHaveBeenCalledWith('1|secret-token');

    accounts = await signedIn();
    api.revokeToken.mockRejectedValueOnce(new AccountApiError('offline'));
    await expect(accounts.signOut()).resolves.toMatchObject({ success: true, account: { status: 'signed_out' }, notice: expect.stringContaining('Connected devices') });
    expect(storage.values[ACCOUNT_STORAGE_KEY]).toEqual({ status: 'signed_out' });
  });

  it('treats a damaged account record as signed out', async () => {
    storage.values[ACCOUNT_STORAGE_KEY] = { status: 'signed_in', token: 42 };

    await expect(service().view()).resolves.toEqual({ success: true, account: { status: 'signed_out' } });
  });

  it('never includes the account token in backups or recovery exports', async () => {
    await signedIn();
    const repository = new LinkShelfRepository(storage);

    const backup = await repository.exportBackup();
    const recovery = await repository.exportRecoveryData();

    expect(JSON.stringify(backup)).not.toContain('secret-token');
    expect(JSON.stringify(recovery)).not.toContain('secret-token');
    expect(storage.values[ACCOUNT_STORAGE_KEY]).toMatchObject({ token: '1|secret-token' });
  });
});
