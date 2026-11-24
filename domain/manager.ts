import { z } from 'zod';

/** Sections that live on the full-tab Manager page instead of the sidebar. */
export const ManagerSectionSchema = z.enum(['home', 'library', 'review', 'archive', 'settings']);
export type ManagerSection = z.infer<typeof ManagerSectionSchema>;

export const MANAGER_PAGE_PATH = '/manager.html';

/** The section named by a Manager URL hash such as `#archive`; Home when absent or unknown. */
export function managerSectionFromHash(hash: string): ManagerSection {
  const parsed = ManagerSectionSchema.safeParse(hash.replace(/^#/, ''));
  return parsed.success ? parsed.data : 'home';
}
