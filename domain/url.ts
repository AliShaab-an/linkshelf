export const DEFAULT_TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
] as const;

export class UrlNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlNormalizationError';
  }
}

export function isEligibleUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;

    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function getDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return value;
  }
}

export function normalizeUrl(
  value: string,
  trackingParamsToRemove: readonly string[] = DEFAULT_TRACKING_PARAMS,
): string {
  if (!isEligibleUrl(value)) {
    throw new UrlNormalizationError(
      'Only valid HTTP and HTTPS URLs can be normalized.',
    );
  }

  const url = new URL(value);
  const configuredTrackingParams = new Set(
    trackingParamsToRemove.map((parameter) => parameter.toLowerCase()),
  );

  url.hash = '';

  for (const parameter of [...url.searchParams.keys()]) {
    const normalizedParameter = parameter.toLowerCase();

    if (
      normalizedParameter.startsWith('utm_') ||
      configuredTrackingParams.has(normalizedParameter)
    ) {
      url.searchParams.delete(parameter);
    }
  }

  url.searchParams.sort();

  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString().replace(/\/(?=\?|$)/, '');
}
