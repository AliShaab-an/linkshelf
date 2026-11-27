import { describe, expect, it } from 'vitest';
import {
  AccountStateSchema,
  clientNameForPlatform,
  hasAccountFeature,
  normalizeApiBaseUrl,
  toAccountView,
  type AccountProfile,
  type AccountState,
} from './account';

const profile: AccountProfile = {
  id: 1, name: 'Test Person', email: 'person@example.test', emailVerified: true,
  plan: 'premium', premiumEndsAt: null,
  entitlements: { cloud_backup: true, shared_collections: false, sync: true },
};

describe('account domain', () => {
  it('never exposes the token or device code to the interface', () => {
    const signedIn: AccountState = { status: 'signed_in', token: '1|secret-token', tokenExpiresAt: null, profile, refreshedAt: '2026-11-27T10:00:00.000Z' };
    const pending: AccountState = { status: 'pending', pending: {
      deviceCode: 'secret-device-code', userCode: 'BCDF-GHJK', verificationUri: 'https://linkshelf.test/extension/connect?code=BCDF-GHJK',
      expiresAt: '2026-11-27T10:10:00.000Z', interval: 5, nextPollAt: '2026-11-27T10:00:05.000Z',
    } };

    expect(JSON.stringify(toAccountView(signedIn))).not.toContain('secret');
    expect(JSON.stringify(toAccountView(pending))).not.toContain('secret');
    expect(toAccountView(pending)).toEqual({ status: 'pending', userCode: 'BCDF-GHJK', verificationUri: 'https://linkshelf.test/extension/connect?code=BCDF-GHJK', expiresAt: '2026-11-27T10:10:00.000Z' });
  });

  it('only grants features the signed-in plan includes', () => {
    const view = toAccountView({ status: 'signed_in', token: 't', tokenExpiresAt: null, profile, refreshedAt: '2026-11-27T10:00:00.000Z' });

    expect(hasAccountFeature(view, 'cloud_backup')).toBe(true);
    expect(hasAccountFeature(view, 'shared_collections')).toBe(false);
    expect(hasAccountFeature({ status: 'signed_out' }, 'cloud_backup')).toBe(false);
    expect(hasAccountFeature({ status: 'unavailable' }, 'sync')).toBe(false);
    expect(hasAccountFeature({ ...view, profile: { ...profile, entitlements: {} } } as typeof view, 'sync')).toBe(false);
  });

  it('rejects damaged stored records', () => {
    expect(AccountStateSchema.safeParse({ status: 'signed_in', token: '' }).success).toBe(false);
    expect(AccountStateSchema.safeParse({ status: 'somewhere' }).success).toBe(false);
    expect(AccountStateSchema.safeParse({ status: 'signed_out' }).success).toBe(true);
  });

  it('names the browser for the connect page', () => {
    expect(clientNameForPlatform('win')).toBe('LinkShelf on Chrome (Windows)');
    expect(clientNameForPlatform('mac')).toBe('LinkShelf on Chrome (macOS)');
    expect(clientNameForPlatform(undefined)).toBe('LinkShelf on Chrome');
    expect(clientNameForPlatform('openbsd')).toBe('LinkShelf on Chrome');
  });

  it('accepts only https backends, or localhost for development', () => {
    expect(normalizeApiBaseUrl('https://linkshelf-backend.test/')).toBe('https://linkshelf-backend.test');
    expect(normalizeApiBaseUrl('https://api.example.com/some/path')).toBe('https://api.example.com');
    expect(normalizeApiBaseUrl('http://localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeApiBaseUrl('http://api.example.com')).toBeNull();
    expect(normalizeApiBaseUrl('not a url')).toBeNull();
    expect(normalizeApiBaseUrl('')).toBeNull();
    expect(normalizeApiBaseUrl(undefined)).toBeNull();
  });
});
