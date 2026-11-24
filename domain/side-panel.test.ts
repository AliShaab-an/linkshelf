import { describe, expect, it } from 'vitest';
import { isSidebarSectionVisible, normalizeSidebarPreferences, sidebarOpeningSection } from './side-panel';

describe('sidebar preferences', () => {
  it('opens where it was left unless a tab is fixed', () => {
    expect(sidebarOpeningSection({ startSection: 'last', hiddenSections: [] }, 'search')).toBe('search');
    expect(sidebarOpeningSection({ startSection: 'today', hiddenSections: [] }, 'search')).toBe('today');
  });

  it('falls back to Saved when the last tab has since been hidden', () => {
    expect(sidebarOpeningSection({ startSection: 'last', hiddenSections: ['search'] }, 'search')).toBe('projects');
  });

  it('removes duplicates and never keeps a hidden tab as the start tab', () => {
    expect(normalizeSidebarPreferences({ startSection: 'park', hiddenSections: ['today', 'park', 'today'] }))
      .toEqual({ startSection: 'last', hiddenSections: ['park', 'today'] });
    expect(normalizeSidebarPreferences({ startSection: 'projects', hiddenSections: [] }).startSection).toBe('projects');
  });

  it('shows a hidden tab only while it is the active one', () => {
    expect(isSidebarSectionVisible(['search'], 'search', 'projects')).toBe(false);
    expect(isSidebarSectionVisible(['search'], 'search', 'search')).toBe(true);
    expect(isSidebarSectionVisible(['search'], 'projects', 'projects')).toBe(true);
  });
});
