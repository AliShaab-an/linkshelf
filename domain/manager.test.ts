import { describe, expect, it } from 'vitest';
import { managerSectionFromHash } from './manager';
import { isOpenManagerMessage } from '@/messaging/contracts';

describe('Manager page sections', () => {
  it('reads the section from the URL hash and falls back to Review', () => {
    expect(managerSectionFromHash('#archive')).toBe('archive');
    expect(managerSectionFromHash('settings')).toBe('settings');
    expect(managerSectionFromHash('')).toBe('review');
    expect(managerSectionFromHash('#park')).toBe('review');
  });

  it('accepts only known sections and integer window ids', () => {
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'settings' } })).toBe(true);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'review', windowId: 3 } })).toBe(true);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'today' } })).toBe(false);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER', payload: { section: 'review', windowId: 1.5 } })).toBe(false);
    expect(isOpenManagerMessage({ type: 'OPEN_MANAGER' })).toBe(false);
  });
});
