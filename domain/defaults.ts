import {
  CURRENT_SCHEMA_VERSION,
  type LinkShelfDatabase,
  type Project,
  type Settings,
} from './schemas';
import { INBOX_PROJECT_ID } from './constants';
import { DEFAULT_TRACKING_PARAMS } from './url';

export { INBOX_PROJECT_ID } from './constants';
export { DEFAULT_TRACKING_PARAMS } from './url';

export function createInboxProject(now: string): Project {
  return {
    id: INBOX_PROJECT_ID,
    name: 'Inbox',
    isInbox: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultSettings(): Settings {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    defaultProjectId: INBOX_PROJECT_ID,
    includePinnedTabsByDefault: false,
    confirmBeforeBulkClose: true,
    notificationsEnabled: true,
    defaultRestoreBehavior: 'restore-and-remove',
    trackingParamsToRemove: [...DEFAULT_TRACKING_PARAMS],
  };
}

export function createEmptyDatabase(
  now: string = new Date().toISOString(),
): LinkShelfDatabase {
  return {
    projects: [createInboxProject(now)],
    sessions: [],
    links: [],
    settings: createDefaultSettings(),
  };
}
