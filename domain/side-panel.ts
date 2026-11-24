import { z } from 'zod';

export const SidePanelSectionSchema = z.enum([
  'park',
  'today',
  'projects',
  'search',
  'review',
  'archive',
  'settings',
]);

export type SidePanelSection = z.infer<typeof SidePanelSectionSchema>;

export const SidePanelNavigationIntentSchema = z.strictObject({
  section: SidePanelSectionSchema,
  focusTarget: z.enum(['search-query']).optional(),
  requestId: z.string().min(1),
});

export type SidePanelNavigationIntent = z.infer<
  typeof SidePanelNavigationIntentSchema
>;

export const SIDE_PANEL_INTENTS_KEY = 'linkshelfSidePanelIntents';
export const SIDE_PANEL_INTENTS_LOCK = 'linkshelf:side-panel-intents';


/** Sidebar tabs a person may hide. Saved is always shown so the sidebar never ends up empty. */
export const HideableSidebarSectionSchema = z.enum(['park', 'search', 'today']);
export type HideableSidebarSection = z.infer<typeof HideableSidebarSectionSchema>;

/** Where the sidebar opens: where it was left, or one fixed tab. */
export const SidebarStartSchema = z.enum(['last', 'projects', 'park', 'search', 'today']);
export type SidebarStart = z.infer<typeof SidebarStartSchema>;

export interface SidebarPreferences {
  startSection: SidebarStart;
  hiddenSections: HideableSidebarSection[];
}

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = { startSection: 'last', hiddenSections: [] };

/** Keeps preferences consistent: no duplicates, and a hidden tab can not be the fixed start tab. */
export function normalizeSidebarPreferences(preferences: SidebarPreferences): SidebarPreferences {
  const hiddenSections = HideableSidebarSectionSchema.options.filter(section => preferences.hiddenSections.includes(section));
  const startHidden = (hiddenSections as string[]).includes(preferences.startSection);
  return { startSection: startHidden ? 'last' : preferences.startSection, hiddenSections };
}

/** The tab the sidebar opens on, given the tab it was last left on. A hidden last tab falls back to Saved. */
export function sidebarOpeningSection(preferences: SidebarPreferences, lastSection: SidePanelSection): SidePanelSection {
  if (preferences.startSection !== 'last') return preferences.startSection;
  return (preferences.hiddenSections as string[]).includes(lastSection) ? 'projects' : lastSection;
}

/** Hidden tabs stay out of the bar, except the one being shown: a shortcut or notification may still open it. */
export function isSidebarSectionVisible(hidden: readonly HideableSidebarSection[], section: SidePanelSection, active: SidePanelSection): boolean {
  return section === active || !(hidden as readonly string[]).includes(section);
}
