import { describe, expect, it, vi } from 'vitest';
import { AccountApiError, createAccountApi } from './account-api';

const apiUser = {
  id: 7, name: 'Test Person', email: 'person@example.test', email_verified: true,
  plan: 'free', premium_ends_at: null,
  entitlements: { cloud_backup: false, shared_collections: false, sync: false },
};

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function api(...responses: Array<Response | Error>) {
  const fetcher = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? respond(500);
  });
  return { client: createAccountApi('https://linkshelf.test', fetcher as unknown as typeof fetch), fetcher };
}

describe('account API client', () => {
  it('starts a device authorization with the client name', async () => {
    const { client, fetcher } = api(respond(201, {
      device_code: 'device', user_code: 'BCDF-GHJK',
      verification_uri: 'https://linkshelf.test/extension/connect',
      verification_uri_complete: 'https://linkshelf.test/extension/connect?code=BCDF-GHJK',
      expires_in: 600, interval: 5,
    }));

    await expect(client.startDeviceAuthorization('LinkShelf on Chrome (Windows)')).resolves.toEqual({
      deviceCode: 'device', userCode: 'BCDF-GHJK',
      verificationUriComplete: 'https://linkshelf.test/extension/connect?code=BCDF-GHJK',
      expiresIn: 600, interval: 5,
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://linkshelf.test/api/v1/extension/device-authorizations');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body))).toEqual({ client_name: 'LinkShelf on Chrome (Windows)' });
  });

  it('maps token responses and RFC 8628 errors', async () => {
    const { client } = api(
      respond(200, { access_token: '1|token', token_type: 'Bearer', expires_at: '2027-11-27T10:00:00+00:00', user: apiUser }),
      respond(400, { error: 'authorization_pending', error_description: 'Waiting' }),
      respond(400, { error: 'slow_down', error_description: 'Slow' }),
    );

    await expect(client.pollToken('device')).resolves.toMatchObject({ kind: 'token', token: '1|token', profile: { id: 7, plan: 'free', emailVerified: true } });
    await expect(client.pollToken('device')).resolves.toEqual({ kind: 'error', error: 'authorization_pending' });
    await expect(client.pollToken('device')).resolves.toEqual({ kind: 'error', error: 'slow_down' });
  });

  it('sends the bearer token and treats 401 as signed out', async () => {
    const { client, fetcher } = api(respond(200, { data: { ...apiUser, plan: 'premium' } }), respond(401, { message: 'Unauthenticated.' }));

    await expect(client.getProfile('1|token')).resolves.toMatchObject({ plan: 'premium' });
    expect(((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer 1|token');
    await expect(client.getProfile('1|token')).resolves.toBeNull();
  });

  it('treats an already revoked token as signed out', async () => {
    const { client } = api(respond(204), respond(401));

    await expect(client.revokeToken('t')).resolves.toBeUndefined();
    await expect(client.revokeToken('t')).resolves.toBeUndefined();
  });

  it('turns network failures, server errors and odd answers into friendly errors', async () => {
    const { client } = api(new TypeError('Failed to fetch'), respond(503), respond(429), respond(200, { data: { id: 'not a number' } }));

    await expect(client.getProfile('t')).rejects.toThrow('could not reach your account');
    await expect(client.getProfile('t')).rejects.toThrow('not available right now');
    await expect(client.getProfile('t')).rejects.toThrow('Too many attempts');
    await expect(client.getProfile('t')).rejects.toBeInstanceOf(AccountApiError);
  });
});
