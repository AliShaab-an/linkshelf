import { z } from 'zod';
import { ApiUserSchema, profileFromApi, type AccountProfile } from '@/domain/account';

/** A request that could not reach the backend or got an answer LinkShelf does not understand. */
export class AccountApiError extends Error {}

const DeviceAuthorizationSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.url(),
  verification_uri_complete: z.url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
});

const TokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_at: z.string().nullable(),
  user: ApiUserSchema,
});

/** RFC 8628 §3.5 answers while waiting for, or instead of, a token. */
const DeviceErrorSchema = z.object({
  error: z.enum(['authorization_pending', 'slow_down', 'access_denied', 'expired_token', 'invalid_grant']),
});
export type DeviceError = z.infer<typeof DeviceErrorSchema>['error'];

const MeSchema = z.object({ data: ApiUserSchema });

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export type TokenPollResult =
  | { kind: 'token'; token: string; tokenExpiresAt: string | null; profile: AccountProfile }
  | { kind: 'error'; error: DeviceError };

export interface AccountApi {
  startDeviceAuthorization(clientName: string): Promise<DeviceAuthorization>;
  pollToken(deviceCode: string): Promise<TokenPollResult>;
  /** The signed-in profile, or null when the token was revoked or expired. */
  getProfile(token: string): Promise<AccountProfile | null>;
  revokeToken(token: string): Promise<void>;
}

/** Account changes run one at a time, so a stalled request must not hold them up for long. */
const REQUEST_TIMEOUT_MS = 15_000;

const UNREACHABLE ='LinkShelf could not reach your account. Check your connection and try again.';
const UNEXPECTED = 'Your account sent an answer LinkShelf did not understand. Try again later.';

export function createAccountApi(baseUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): AccountApi {
  async function send(method: 'GET' | 'POST' | 'DELETE', path: string, options: { body?: unknown; token?: string } = {}): Promise<{ status: number; json: unknown }> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/api/v1/${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AccountApiError(UNREACHABLE);
    }
    if (response.status === 429) throw new AccountApiError('Too many attempts. Wait a minute and try again.');
    if (response.status >= 500) throw new AccountApiError('Your account is not available right now. Try again later.');
    const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: response.status, json };
  }

  function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new AccountApiError(UNEXPECTED);
    return parsed.data;
  }

  return {
    async startDeviceAuthorization(clientName) {
      const { status, json } = await send('POST', 'extension/device-authorizations', { body: { client_name: clientName } });
      if (status !== 201) throw new AccountApiError(UNEXPECTED);
      const body = parse(DeviceAuthorizationSchema, json);
      return {
        deviceCode: body.device_code,
        userCode: body.user_code,
        verificationUriComplete: body.verification_uri_complete,
        expiresIn: body.expires_in,
        interval: body.interval,
      };
    },

    async pollToken(deviceCode) {
      const { status, json } = await send('POST', 'extension/tokens', { body: { device_code: deviceCode } });
      if (status === 200) {
        const body = parse(TokenSchema, json);
        return { kind: 'token', token: body.access_token, tokenExpiresAt: body.expires_at, profile: profileFromApi(body.user) };
      }
      if (status === 400) return { kind: 'error', error: parse(DeviceErrorSchema, json).error };
      throw new AccountApiError(UNEXPECTED);
    },

    async getProfile(token) {
      const { status, json } = await send('GET', 'me', { token });
      if (status === 401 || status === 403) return null;
      if (status !== 200) throw new AccountApiError(UNEXPECTED);
      return profileFromApi(parse(MeSchema, json).data);
    },

    async revokeToken(token) {
      const { status } = await send('DELETE', 'extension/tokens/current', { token });
      // Already revoked or expired counts as signed out.
      if (status !== 204 && status !== 401) throw new AccountApiError(UNEXPECTED);
    },
  };
}
