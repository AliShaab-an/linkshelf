import { z } from 'zod';

/** Its own storage key: exports, automatic backups and recovery only read `linkshelfDatabase`, so the token never leaves the device. */
export const ACCOUNT_STORAGE_KEY = 'linkshelfAccount';

/** Account features the backend can unlock. Unknown keys from a newer backend are ignored. */
export const ACCOUNT_FEATURES = ['cloud_backup', 'shared_collections', 'sync'] as const;
export type AccountFeature = typeof ACCOUNT_FEATURES[number];

export const ACCOUNT_FEATURE_LABELS: Record<AccountFeature, { title: string; description: string }> = {
  cloud_backup: { title: 'Cloud backup', description: 'Keep a copy of your library in your account and restore it on any computer.' },
  shared_collections: { title: 'Shared collections', description: 'Share a read-only link to a project.' },
  sync: { title: 'Sync across devices', description: 'Keep LinkShelf up to date on every computer you use.' },
};

export const AccountPlanSchema = z.enum(['free', 'premium']);
export type AccountPlan = z.infer<typeof AccountPlanSchema>;

const IsoDateSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Expected a date');

export const AccountProfileSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  plan: AccountPlanSchema,
  premiumEndsAt: IsoDateSchema.nullable(),
  entitlements: z.record(z.string(), z.boolean()),
});
export type AccountProfile = z.infer<typeof AccountProfileSchema>;

export const PendingSignInSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.url(),
  expiresAt: IsoDateSchema,
  /** Seconds between polls; grows when the server answers slow_down. */
  interval: z.number().int().positive(),
  nextPollAt: IsoDateSchema,
});
export type PendingSignIn = z.infer<typeof PendingSignInSchema>;

export const AccountStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('signed_out') }),
  z.object({ status: z.literal('pending'), pending: PendingSignInSchema }),
  z.object({
    status: z.literal('signed_in'),
    token: z.string().min(1),
    tokenExpiresAt: IsoDateSchema.nullable(),
    profile: AccountProfileSchema,
    refreshedAt: IsoDateSchema,
  }),
]);
export type AccountState = z.infer<typeof AccountStateSchema>;

export const SIGNED_OUT: AccountState = { status: 'signed_out' };

/** What the interface may see: never the token or the secret device code. */
export type AccountView =
  | { status: 'unavailable' }
  | { status: 'signed_out' }
  | { status: 'pending'; userCode: string; verificationUri: string; expiresAt: string }
  | { status: 'signed_in'; profile: AccountProfile; refreshedAt: string };

export function toAccountView(state: AccountState): AccountView {
  switch (state.status) {
    case 'signed_out': return { status: 'signed_out' };
    case 'pending': return { status: 'pending', userCode: state.pending.userCode, verificationUri: state.pending.verificationUri, expiresAt: state.pending.expiresAt };
    case 'signed_in': return { status: 'signed_in', profile: state.profile, refreshedAt: state.refreshedAt };
  }
}

/** Whether the signed-in account may use a feature. Signed out, pending and unknown features are all "no". */
export function hasAccountFeature(view: AccountView, feature: AccountFeature): boolean {
  return view.status === 'signed_in' && view.profile.entitlements[feature] === true;
}

/** The user object the backend sends from /api/v1/me and the token endpoint. */
export const ApiUserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  email_verified: z.boolean(),
  plan: AccountPlanSchema,
  premium_ends_at: IsoDateSchema.nullable(),
  entitlements: z.record(z.string(), z.boolean()),
});

export function profileFromApi(user: z.infer<typeof ApiUserSchema>): AccountProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.email_verified,
    plan: user.plan,
    premiumEndsAt: user.premium_ends_at,
    entitlements: user.entitlements,
  };
}

/** Shown on the connect page and in the account's Connected devices, e.g. "Chrome on Windows". */
export function clientNameForPlatform(os: string | undefined): string {
  const names: Record<string, string> = { win: 'Windows', mac: 'macOS', linux: 'Linux', cros: 'ChromeOS', android: 'Android' };
  const platform = os ? names[os] : undefined;
  return platform ? `LinkShelf on Chrome (${platform})` : 'LinkShelf on Chrome';
}

/** The backend base URL fixed at build time; accounts are hidden in builds without one. */
export function normalizeApiBaseUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
    return url.origin;
  } catch {
    return null;
  }
}
