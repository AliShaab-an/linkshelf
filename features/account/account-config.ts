import { normalizeApiBaseUrl } from '@/domain/account';

/**
 * The LinkShelf backend for this build, from WXT_API_BASE_URL at build time
 * (for example in .env.development). Null hides every account feature.
 */
export const ACCOUNT_API_BASE_URL = normalizeApiBaseUrl(import.meta.env.WXT_API_BASE_URL);
