import { describe, expect, it } from 'vitest';
import { managerSectionFromHash, settingsPageFromHash } from './manager';
import { isOpenManagerMessage } from '@/messaging/contracts';

describe('Manager page sections', () => {
  it('reads the section from the URL hash and falls back to Home', () => {
    expect(managerSectionFromHash('#archive')).toBe('archive');
    expect(managerSectionFromHash('settings')).toBe('settings');
    expect(managerSectionFromHash('')).toBe('home');
    expect(managerSectionFromHash('#park')).toBe('home');
    expect(managerSectionFromHash('#review')).toBe('review');
    expect(managerSectionFromHash('#library')).toBe('library');
    expect(managerSectionFromHash('#bin')).toBe('bin');
  });

  it('reads Settings pages after the slash', () => {
    expect(managerSectionFromHash('#settings/data')).toBe('settings');
    expect(settingsPageFromHash('#settings/data')).toBe('data');
    expect(settingsPageFromHash('#settings/about')).toBe('about');
    expect(settingsPageFromHash('#settings')).toBe('general');
    expect(settingsPageFromHash('#settings/nope')).toBe('general');
    expect(settingsPageFromHash('#archive/data')).toBe('general');
  });

  it('accepts only known sections and integer window ids', () => {
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'settings' } })).toBe(true);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'review', windowId: 3 } })).toBe(true);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'today' } })).toBe(false);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'review', windowId: 1.5 } })).toBe(false);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER' })).toBe(false);
  });
});
