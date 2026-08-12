import { describe, expect, it } from 'vitest';
import {
  UrlNormalizationError,
  getDomain,
  isEligibleUrl,
  normalizeUrl,
} from './url';

describe('URL domain helpers', () => {
  it('accepts only HTTP and HTTPS URLs for parking', () => {
    expect(isEligibleUrl('https://example.com')).toBe(true);
    expect(isEligibleUrl('http://example.com')).toBe(true);
    expect(isEligibleUrl('chrome://extensions')).toBe(false);
    expect(isEligibleUrl('not a URL')).toBe(false);
  });

  it('extracts a lowercase domain without a leading www', () => {
    expect(getDomain('https://WWW.Example.COM/docs')).toBe('example.com');
  });
});

describe('normalizeUrl', () => {
  it('normalizes hostname casing and default ports', () => {
    expect(normalizeUrl('HTTPS://EXAMPLE.COM:443/docs')).toBe(
      'https://example.com/docs',
    );
  });

  it('removes fragments and trailing slashes', () => {
    expect(normalizeUrl('https://example.com/docs/#installation')).toBe(
      'https://example.com/docs',
    );
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('removes all utm parameters regardless of casing', () => {
    expect(
      normalizeUrl(
        'https://example.com/article?UTM_Source=newsletter&utm_custom=value&id=42',
      ),
    ).toBe('https://example.com/article?id=42');
  });

  it('removes configured tracking parameters and preserves useful parameters', () => {
    expect(
      normalizeUrl(
        'https://example.com/search?q=react&gclid=advertising&language=en',
      ),
    ).toBe('https://example.com/search?language=en&q=react');
  });

  it('sorts query parameters for stable duplicate comparison', () => {
    expect(normalizeUrl('https://example.com/page?z=last&a=first')).toBe(
      'https://example.com/page?a=first&z=last',
    );
  });

  it('produces the same value for equivalent tracked URLs', () => {
    const first = normalizeUrl(
      'https://Example.com/article/?id=42&utm_source=email#comments',
    );
    const second = normalizeUrl('https://example.com/article?id=42');

    expect(first).toBe(second);
  });

  it('rejects invalid and restricted URLs', () => {
    expect(() => normalizeUrl('chrome://settings')).toThrow(
      UrlNormalizationError,
    );
    expect(() => normalizeUrl('not a URL')).toThrow(UrlNormalizationError);
  });
});
