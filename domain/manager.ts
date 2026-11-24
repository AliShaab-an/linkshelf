import { z } from 'zod';

/** Sections that live on the full-tab Manager page instead of the sidebar. */
export const ManagerSectionSchema = z.enum(['home', 'library', 'review', 'archive', 'bin', 'duplicates', 'search', 'settings']);
export type ManagerSection = z.infer<typeof ManagerSectionSchema>;

export const MANAGER_PAGE_PATH = '/manager.html';

/** The section named by a Manager URL hash such as `#archive` or `#settings/data`; Home when absent or unknown. */
export function managerSectionFromHash(hash: string): ManagerSection {
  const parsed = ManagerSectionSchema.safeParse(hash.replace(/^#/, '').split('/')[0]);
  return parsed.success ? parsed.data : 'home';
}

/** The pages inside Settings. */
export const SettingsPageSchema = z.enum(['general', 'data', 'about']);
export type SettingsPage = z.infer<typeof SettingsPageSchema>;

/** The Settings page named after the slash in `#settings/data`; General when absent or unknown. */
export function settingsPageFromHash(hash: string): SettingsPage {
  const [section, page] = hash.replace(/^#/, '').split('/');
  const parsed = SettingsPageSchema.safeParse(page);
  return section === 'settings' && parsed.success ? parsed.data : 'general';
}
