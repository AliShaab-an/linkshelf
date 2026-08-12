import { describe, expect, it } from 'vitest';
import { classifyWindowTabs } from './window-tabs';

describe('classifyWindowTabs', () => {
  it('classifies normal, pinned, and restricted tabs', () => {
    const tabs = classifyWindowTabs([
      {
        id: 3,
        title: 'Settings',
        url: 'chrome://settings',
        index: 2,
        active: false,
        pinned: false,
      },
      {
        id: 1,
        title: 'React',
        url: 'https://react.dev/learn',
        index: 0,
        active: true,
        pinned: false,
      },
      {
        id: 2,
        title: 'Email',
        url: 'https://mail.example.com',
        index: 1,
        active: false,
        pinned: true,
      },
    ]);

    expect(tabs.map((tab) => tab.status)).toEqual([
      'eligible',
      'pinned',
      'restricted',
    ]);
    expect(tabs[0].domain).toBe('react.dev');
    expect(tabs[2].domain).toBe('Restricted page');
  });

  it('omits browser records without a tab id', () => {
    expect(
      classifyWindowTabs([
        { index: 0, active: true, pinned: false, url: 'https://example.com' },
      ]),
    ).toEqual([]);
  });
});
