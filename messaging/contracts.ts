import type {
  LinkShelfBackup,
  ParkingSession,
  Project,
  SavedLink,
  Settings,
} from '@/domain/schemas';
import type {
  ImportBackupPreview,
  ImportBackupResult,
  ImportMode,
} from '@/storage/repository';

export interface GetSettingsMessage { type: 'GET_SETTINGS' }
export type GetSettingsResponse =
  | { success: true; settings: Settings; projects: Project[] }
  | { success: false; error: { message: string } };

export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  payload: Pick<Settings, 'defaultProjectId' | 'includePinnedTabsByDefault' | 'confirmBeforeBulkClose' | 'notificationsEnabled' | 'defaultRestoreBehavior' | 'displayDensity' | 'defaultRestoreMode'>;
}
export type UpdateSettingsResponse =
  | { success: true; settings: Settings }
  | { success: false; error: { message: string } };

export interface ExportDataMessage { type: 'EXPORT_DATA' }
export type ExportDataResponse =
  | { success: true; backup: LinkShelfBackup }
  | { success: false; error: { message: string } };

export interface PreviewImportDataMessage {
  type: 'PREVIEW_IMPORT_DATA';
  payload: { backup: unknown; mode: ImportMode };
}
export type PreviewImportDataResponse =
  | { success: true; preview: ImportBackupPreview }
  | { success: false; error: { message: string } };

export interface ImportDataMessage {
  type: 'IMPORT_DATA';
  payload: { backup: unknown; mode: ImportMode; revisionToken: string };
}
export type ImportDataResponse =
  | { success: true; result: ImportBackupResult }
  | { success: false; error: { message: string } };

export interface ParkedSessionGroup {
  session: ParkingSession;
  links: SavedLink[];
}

export interface LinkSearchResult {
  link: SavedLink;
  projectName: string;
}

export interface NativeBookmarkResult {
  id: string;
  parentId?: string;
  title: string;
  url: string;
}

export interface BookmarkFolderOption {
  id: string;
  title: string;
  path: string;
}

export interface SearchLinksMessage {
  type: 'SEARCH_LINKS';
  payload: { query: string };
}

export type SearchLinksResponse =
  | {
      success: true;
      results: LinkSearchResult[];
      bookmarks: NativeBookmarkResult[];
    }
  | { success: false; error: { message: string } };

export interface GetBookmarkFoldersMessage {
  type: 'GET_BOOKMARK_FOLDERS';
}

export type GetBookmarkFoldersResponse =
  | { success: true; folders: BookmarkFolderOption[] }
  | { success: false; error: { message: string } };

export interface BookmarkLinkMessage {
  type: 'BOOKMARK_LINK';
  payload: { linkId: string; parentId: string };
}

export type BookmarkLinkResponse =
  | {
      success: true;
      linkId: string;
      bookmark: NativeBookmarkResult;
    }
  | {
      success: false;
      bookmarkCreated: boolean;
      bookmark?: NativeBookmarkResult;
      duplicates?: NativeBookmarkResult[];
      error: {
        code:
          | 'LINK_NOT_FOUND'
          | 'LINK_NOT_PARKED'
          | 'DUPLICATE_BOOKMARK'
          | 'BOOKMARK_CREATE_FAILED'
          | 'STORAGE_FAILED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export interface OpenBookmarkMessage {
  type: 'OPEN_BOOKMARK';
  payload: { url: string };
}

export type OpenBookmarkResponse =
  | { success: true }
  | { success: false; error: { message: string } };

export type WindowTabStatus = 'eligible' | 'pinned' | 'restricted';

export interface WindowTabCandidate {
  id: number;
  title: string;
  url: string;
  domain: string;
  index: number;
  active: boolean;
  pinned: boolean;
  status: WindowTabStatus;
  reason?: string;
}

export interface GetCurrentWindowTabsMessage {
  type: 'GET_CURRENT_WINDOW_TABS';
}

export type GetCurrentWindowTabsResponse =
  | {
      success: true;
      tabs: WindowTabCandidate[];
    }
  | {
      success: false;
      error: { message: string };
    };

export interface ParkCurrentTabMessage {
  type: 'PARK_CURRENT_TAB';
  payload: {
    tabId: number;
    projectId: string;
    note?: string;
    reminderAt?: string;
  };
}

export interface ParkSelectedTabsMessage {
  type: 'PARK_SELECTED_TABS';
  payload: {
    tabIds: number[];
    projectId: string;
    note?: string;
    reminderAt?: string;
  };
}

export type ParkSelectedTabsResponse =
  | {
      success: true;
      saved: true;
      sessionId: string;
      linkIds: string[];
      closedTabIds: number[];
      failedToCloseTabIds: number[];
    }
  | {
      success: false;
      saved: false;
      closedTabIds: [];
      error: {
        code:
          | 'INVALID_SELECTION'
          | 'TAB_NOT_FOUND'
          | 'TAB_NOT_ELIGIBLE'
          | 'TABS_MOVED'
          | 'STORAGE_FAILED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export interface GetParkedLinksMessage {
  type: 'GET_PARKED_LINKS';
  payload?: {
    projectId?: string;
  };
}

export interface GetParkedSessionGroupsMessage {
  type: 'GET_PARKED_SESSION_GROUPS';
  payload?: { projectId?: string };
}

export type GetParkedSessionGroupsResponse =
  | { success: true; groups: ParkedSessionGroup[] }
  | { success: false; error: { message: string } };

export interface GetArchivedLinksMessage {
  type: 'GET_ARCHIVED_LINKS';
  payload?: { projectId?: string };
}

export type GetArchivedLinksResponse =
  | { success: true; links: SavedLink[] }
  | { success: false; error: { message: string } };

export interface GetDueReminderLinksMessage {
  type: 'GET_DUE_REMINDER_LINKS';
}

export type GetDueReminderLinksResponse =
  | {
      success: true;
      links: SavedLink[];
    }
  | {
      success: false;
      error: {
        message: string;
      };
    };

export type GetParkedLinksResponse =
  | {
      success: true;
      links: SavedLink[];
    }
  | {
      success: false;
      error: {
        message: string;
      };
    };

export interface GetProjectsMessage {
  type: 'GET_PROJECTS';
}

export type GetProjectsResponse =
  | {
      success: true;
      projects: Project[];
    }
  | {
      success: false;
      error: {
        message: string;
      };
    };

export interface CreateProjectMessage {
  type: 'CREATE_PROJECT';
  payload: {
    name: string;
  };
}

export type CreateProjectResponse =
  | {
      success: true;
      project: Project;
    }
  | {
      success: false;
      error: {
        code: 'INVALID_NAME' | 'DUPLICATE_NAME' | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export interface RenameProjectMessage {
  type: 'RENAME_PROJECT';
  payload: {
    projectId: string;
    name: string;
  };
}

export type RenameProjectResponse =
  | {
      success: true;
      project: Project;
    }
  | {
      success: false;
      error: {
        code:
          | 'INVALID_NAME'
          | 'DUPLICATE_NAME'
          | 'PROJECT_NOT_FOUND'
          | 'INBOX_PROTECTED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export interface DeleteProjectMessage {
  type: 'DELETE_PROJECT';
  payload: {
    projectId: string;
  };
}

export type DeleteProjectResponse =
  | {
      success: true;
      deletedProjectId: string;
      inboxProjectId: string;
      movedLinks: number;
      movedSessions: number;
    }
  | {
      success: false;
      error: {
        code:
          | 'PROJECT_NOT_FOUND'
          | 'INBOX_PROTECTED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export interface RestoreLinkMessage {
  type: 'RESTORE_LINK';
  payload: {
    linkId: string;
  };
}

export interface ArchiveLinkMessage {
  type: 'ARCHIVE_LINK';
  payload: { linkId: string };
}

export interface UnarchiveLinkMessage {
  type: 'UNARCHIVE_LINK';
  payload: { linkId: string };
}

export interface RemoveLinkMessage {
  type: 'REMOVE_LINK';
  payload: { linkId: string };
}

export interface MoveLinkMessage {
  type: 'MOVE_LINK';
  payload: { linkId: string; projectId: string };
}

export type LinkLifecycleResponse =
  | { success: true; link: SavedLink }
  | {
      success: false;
      error: {
        code: 'LINK_NOT_FOUND' | 'PROJECT_NOT_FOUND' | 'INVALID_STATE' | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export interface RestoreSessionMessage {
  type: 'RESTORE_SESSION';
  payload: { sessionId: string };
}

export type RestoreMode = 'normal' | 'unloaded';

export interface RestoreProjectMessage {
  type: 'RESTORE_PROJECT';
  payload: { projectId: string; mode: RestoreMode };
}

export type RestoreProjectResponse =
  | {
      success: true;
      projectId: string;
      openedLinkIds: string[];
      restoredLinkIds: string[];
      failedLinkIds: string[];
      discardedLinkIds: string[];
      fallbackLinkIds: string[];
      complete: boolean;
    }
  | {
      success: false;
      opened: boolean;
      error: {
        code:
          | 'PROJECT_EMPTY'
          | 'TAB_OPEN_FAILED'
          | 'STORAGE_FAILED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export type RestoreSessionResponse =
  | {
      success: true;
      sessionId: string;
      openedLinkIds: string[];
      restoredLinkIds: string[];
      failedLinkIds: string[];
      discardedLinkIds: string[];
      fallbackLinkIds: string[];
      complete: boolean;
    }
  | {
      success: false;
      opened: boolean;
      error: {
        code:
          | 'SESSION_EMPTY'
          | 'TAB_OPEN_FAILED'
          | 'STORAGE_FAILED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export type RestoreLinkResponse =
  | {
      success: true;
      linkId: string;
      opened: true;
      restored: boolean;
    }
  | {
      success: false;
      opened: boolean;
      error: {
        code:
          | 'LINK_NOT_FOUND'
          | 'LINK_NOT_PARKED'
          | 'TAB_OPEN_FAILED'
          | 'STORAGE_FAILED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export type ParkCurrentTabResponse =
  | {
      success: true;
      saved: true;
      closed: true;
      linkId: string;
      sessionId: string;
    }
  | {
      success: false;
      saved: boolean;
      closed: false;
      linkId?: string;
      sessionId?: string;
      error: {
        code:
          | 'TAB_NOT_FOUND'
          | 'TAB_NOT_ELIGIBLE'
          | 'STORAGE_FAILED'
          | 'TAB_CLOSE_FAILED'
          | 'UNEXPECTED_ERROR';
        message: string;
      };
    };

export function isParkCurrentTabMessage(
  message: unknown,
): message is ParkCurrentTabMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<ParkCurrentTabMessage>;

  return (
    candidate.type === 'PARK_CURRENT_TAB' &&
    typeof candidate.payload?.tabId === 'number' &&
    typeof candidate.payload.projectId === 'string' &&
    candidate.payload.projectId.length > 0 &&
    (candidate.payload.note === undefined ||
      typeof candidate.payload.note === 'string') &&
    (candidate.payload.reminderAt === undefined ||
      typeof candidate.payload.reminderAt === 'string')
  );
}

export function isSearchLinksMessage(
  message: unknown,
): message is SearchLinksMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<SearchLinksMessage>;
  return (
    candidate.type === 'SEARCH_LINKS' &&
    typeof candidate.payload?.query === 'string'
  );
}

export function isGetSettingsMessage(message: unknown): message is GetSettingsMessage {
  return typeof message === 'object' && message !== null &&
    (message as Partial<GetSettingsMessage>).type === 'GET_SETTINGS';
}

export function isUpdateSettingsMessage(message: unknown): message is UpdateSettingsMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<UpdateSettingsMessage>;
  const payload = candidate.payload;
  return candidate.type === 'UPDATE_SETTINGS' && !!payload &&
    typeof payload.defaultProjectId === 'string' &&
    typeof payload.includePinnedTabsByDefault === 'boolean' &&
    typeof payload.confirmBeforeBulkClose === 'boolean' &&
    typeof payload.notificationsEnabled === 'boolean' &&
    (payload.defaultRestoreBehavior === 'restore-and-remove' || payload.defaultRestoreBehavior === 'open-copy') &&
    (payload.displayDensity === 'comfortable' || payload.displayDensity === 'compact') &&
    (payload.defaultRestoreMode === 'normal' || payload.defaultRestoreMode === 'unloaded');
}

export function isExportDataMessage(message: unknown): message is ExportDataMessage {
  return typeof message === 'object' && message !== null &&
    (message as Partial<ExportDataMessage>).type === 'EXPORT_DATA';
}

export function isPreviewImportDataMessage(
  message: unknown,
): message is PreviewImportDataMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<PreviewImportDataMessage>;
  return candidate.type === 'PREVIEW_IMPORT_DATA' && !!candidate.payload &&
    'backup' in candidate.payload &&
    (candidate.payload.mode === 'merge' || candidate.payload.mode === 'replace');
}

export function isImportDataMessage(message: unknown): message is ImportDataMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<ImportDataMessage>;
  return candidate.type === 'IMPORT_DATA' && !!candidate.payload &&
    'backup' in candidate.payload &&
    (candidate.payload.mode === 'merge' || candidate.payload.mode === 'replace') &&
    typeof candidate.payload.revisionToken === 'string' &&
    candidate.payload.revisionToken.length > 0;
}

export function isGetBookmarkFoldersMessage(
  message: unknown,
): message is GetBookmarkFoldersMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<GetBookmarkFoldersMessage>).type ===
      'GET_BOOKMARK_FOLDERS'
  );
}

export function isBookmarkLinkMessage(
  message: unknown,
): message is BookmarkLinkMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<BookmarkLinkMessage>;
  return (
    candidate.type === 'BOOKMARK_LINK' &&
    typeof candidate.payload?.linkId === 'string' &&
    candidate.payload.linkId.length > 0 &&
    typeof candidate.payload.parentId === 'string' &&
    candidate.payload.parentId.length > 0
  );
}

export function isOpenBookmarkMessage(
  message: unknown,
): message is OpenBookmarkMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<OpenBookmarkMessage>;
  return (
    candidate.type === 'OPEN_BOOKMARK' &&
    typeof candidate.payload?.url === 'string' &&
    candidate.payload.url.length > 0
  );
}

export function isParkSelectedTabsMessage(
  message: unknown,
): message is ParkSelectedTabsMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<ParkSelectedTabsMessage>;
  const tabIds = candidate.payload?.tabIds;

  return (
    candidate.type === 'PARK_SELECTED_TABS' &&
    Array.isArray(tabIds) &&
    tabIds.length > 0 &&
    tabIds.every((tabId) => Number.isInteger(tabId) && tabId >= 0) &&
    new Set(tabIds).size === tabIds.length &&
    typeof candidate.payload?.projectId === 'string' &&
    candidate.payload.projectId.length > 0 &&
    (candidate.payload.note === undefined ||
      typeof candidate.payload.note === 'string') &&
    (candidate.payload.reminderAt === undefined ||
      typeof candidate.payload.reminderAt === 'string')
  );
}

export function isGetCurrentWindowTabsMessage(
  message: unknown,
): message is GetCurrentWindowTabsMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<GetCurrentWindowTabsMessage>).type ===
      'GET_CURRENT_WINDOW_TABS'
  );
}

export function isGetParkedLinksMessage(
  message: unknown,
): message is GetParkedLinksMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<GetParkedLinksMessage>).type === 'GET_PARKED_LINKS'
  );
}

export function isGetParkedSessionGroupsMessage(
  message: unknown,
): message is GetParkedSessionGroupsMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<GetParkedSessionGroupsMessage>).type ===
      'GET_PARKED_SESSION_GROUPS'
  );
}

export function isGetArchivedLinksMessage(
  message: unknown,
): message is GetArchivedLinksMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<GetArchivedLinksMessage>).type === 'GET_ARCHIVED_LINKS'
  );
}

export function isGetDueReminderLinksMessage(
  message: unknown,
): message is GetDueReminderLinksMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<GetDueReminderLinksMessage>).type ===
      'GET_DUE_REMINDER_LINKS'
  );
}

export function isGetProjectsMessage(message: unknown): message is GetProjectsMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<GetProjectsMessage>).type === 'GET_PROJECTS'
  );
}

export function isCreateProjectMessage(
  message: unknown,
): message is CreateProjectMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<CreateProjectMessage>;

  return (
    candidate.type === 'CREATE_PROJECT' &&
    typeof candidate.payload?.name === 'string'
  );
}

export function isRenameProjectMessage(
  message: unknown,
): message is RenameProjectMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<RenameProjectMessage>;

  return (
    candidate.type === 'RENAME_PROJECT' &&
    typeof candidate.payload?.projectId === 'string' &&
    candidate.payload.projectId.length > 0 &&
    typeof candidate.payload.name === 'string'
  );
}

export function isDeleteProjectMessage(
  message: unknown,
): message is DeleteProjectMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<DeleteProjectMessage>;

  return (
    candidate.type === 'DELETE_PROJECT' &&
    typeof candidate.payload?.projectId === 'string' &&
    candidate.payload.projectId.length > 0
  );
}

export function isRestoreLinkMessage(
  message: unknown,
): message is RestoreLinkMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<RestoreLinkMessage>;

  return (
    candidate.type === 'RESTORE_LINK' &&
    typeof candidate.payload?.linkId === 'string' &&
    candidate.payload.linkId.length > 0
  );
}

function isLinkLifecycleMessage<T extends string>(
  message: unknown,
  type: T,
): message is { type: T; payload: { linkId: string } } {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { type?: unknown; payload?: { linkId?: unknown } };
  return (
    candidate.type === type &&
    typeof candidate.payload?.linkId === 'string' &&
    candidate.payload.linkId.length > 0
  );
}

export function isArchiveLinkMessage(message: unknown): message is ArchiveLinkMessage {
  return isLinkLifecycleMessage(message, 'ARCHIVE_LINK');
}

export function isUnarchiveLinkMessage(message: unknown): message is UnarchiveLinkMessage {
  return isLinkLifecycleMessage(message, 'UNARCHIVE_LINK');
}

export function isRemoveLinkMessage(message: unknown): message is RemoveLinkMessage {
  return isLinkLifecycleMessage(message, 'REMOVE_LINK');
}

export function isMoveLinkMessage(message: unknown): message is MoveLinkMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<MoveLinkMessage>;
  return candidate.type === 'MOVE_LINK' &&
    typeof candidate.payload?.linkId === 'string' && candidate.payload.linkId.length > 0 &&
    typeof candidate.payload.projectId === 'string' && candidate.payload.projectId.length > 0;
}

export function isRestoreSessionMessage(
  message: unknown,
): message is RestoreSessionMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<RestoreSessionMessage>;
  return (
    candidate.type === 'RESTORE_SESSION' &&
    typeof candidate.payload?.sessionId === 'string' &&
    candidate.payload.sessionId.length > 0
  );
}

export function isRestoreProjectMessage(
  message: unknown,
): message is RestoreProjectMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Partial<RestoreProjectMessage>;
  return (
    candidate.type === 'RESTORE_PROJECT' &&
    typeof candidate.payload?.projectId === 'string' &&
    candidate.payload.projectId.length > 0 &&
    (candidate.payload.mode === 'normal' || candidate.payload.mode === 'unloaded')
  );
}

function assertResponse(value: unknown): asserts value is { success: boolean } {
  if (typeof value !== 'object' || value === null || !('success' in value)) {
    throw new Error(
      'LinkShelf was updated. Reload it from chrome://extensions and try again.',
    );
  }
}

export async function getSettings(): Promise<GetSettingsResponse> {
  const response = (await browser.runtime.sendMessage({
    type: 'GET_SETTINGS',
  } satisfies GetSettingsMessage)) as unknown;
  assertResponse(response);
  return response as GetSettingsResponse;
}

export async function updateSettings(
  settings: UpdateSettingsMessage['payload'],
): Promise<UpdateSettingsResponse> {
  const response = (await browser.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: settings,
  } satisfies UpdateSettingsMessage)) as unknown;
  assertResponse(response);
  return response as UpdateSettingsResponse;
}

export async function exportData(): Promise<ExportDataResponse> {
  const response = (await browser.runtime.sendMessage({
    type: 'EXPORT_DATA',
  } satisfies ExportDataMessage)) as unknown;
  assertResponse(response);
  return response as ExportDataResponse;
}

export async function previewImportData(
  backup: unknown,
  mode: ImportMode,
): Promise<PreviewImportDataResponse> {
  const response = (await browser.runtime.sendMessage({
    type: 'PREVIEW_IMPORT_DATA',
    payload: { backup, mode },
  } satisfies PreviewImportDataMessage)) as unknown;
  assertResponse(response);
  return response as PreviewImportDataResponse;
}

export async function importData(
  backup: unknown,
  mode: ImportMode,
  revisionToken: string,
): Promise<ImportDataResponse> {
  const response = (await browser.runtime.sendMessage({
    type: 'IMPORT_DATA',
    payload: { backup, mode, revisionToken },
  } satisfies ImportDataMessage)) as unknown;
  assertResponse(response);
  return response as ImportDataResponse;
}

export async function parkCurrentTab(
  tabId: number,
  options: {
    projectId: string;
    note?: string;
    reminderAt?: string;
  },
): Promise<ParkCurrentTabResponse> {
  const message: ParkCurrentTabMessage = {
    type: 'PARK_CURRENT_TAB',
    payload: { tabId, ...options },
  };

  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as ParkCurrentTabResponse;
}

export async function searchLinks(query: string): Promise<SearchLinksResponse> {
  const message: SearchLinksMessage = {
    type: 'SEARCH_LINKS',
    payload: { query },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as SearchLinksResponse;
}

export async function getBookmarkFolders(): Promise<GetBookmarkFoldersResponse> {
  const response = (await browser.runtime.sendMessage({
    type: 'GET_BOOKMARK_FOLDERS',
  } satisfies GetBookmarkFoldersMessage)) as unknown;
  assertResponse(response);
  return response as GetBookmarkFoldersResponse;
}

export async function bookmarkLink(
  linkId: string,
  parentId: string,
): Promise<BookmarkLinkResponse> {
  const message: BookmarkLinkMessage = {
    type: 'BOOKMARK_LINK',
    payload: { linkId, parentId },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as BookmarkLinkResponse;
}

export async function openBookmark(url: string): Promise<OpenBookmarkResponse> {
  const message: OpenBookmarkMessage = {
    type: 'OPEN_BOOKMARK',
    payload: { url },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as OpenBookmarkResponse;
}

export async function parkSelectedTabs(
  tabIds: number[],
  options: {
    projectId: string;
    note?: string;
    reminderAt?: string;
  },
): Promise<ParkSelectedTabsResponse> {
  const message: ParkSelectedTabsMessage = {
    type: 'PARK_SELECTED_TABS',
    payload: { tabIds, ...options },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as ParkSelectedTabsResponse;
}

export async function getCurrentWindowTabs(): Promise<GetCurrentWindowTabsResponse> {
  const message: GetCurrentWindowTabsMessage = {
    type: 'GET_CURRENT_WINDOW_TABS',
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as GetCurrentWindowTabsResponse;
}

export async function getParkedLinks(
  projectId?: string,
): Promise<GetParkedLinksResponse> {
  const message: GetParkedLinksMessage = {
    type: 'GET_PARKED_LINKS',
    payload: { projectId },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as GetParkedLinksResponse;
}

export async function getParkedSessionGroups(
  projectId?: string,
): Promise<GetParkedSessionGroupsResponse> {
  const message: GetParkedSessionGroupsMessage = {
    type: 'GET_PARKED_SESSION_GROUPS',
    payload: { projectId },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as GetParkedSessionGroupsResponse;
}

export async function getArchivedLinks(
  projectId?: string,
): Promise<GetArchivedLinksResponse> {
  const message: GetArchivedLinksMessage = {
    type: 'GET_ARCHIVED_LINKS',
    payload: { projectId },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as GetArchivedLinksResponse;
}

export async function getDueReminderLinks(): Promise<GetDueReminderLinksResponse> {
  const message: GetDueReminderLinksMessage = {
    type: 'GET_DUE_REMINDER_LINKS',
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as GetDueReminderLinksResponse;
}

export async function getProjects(): Promise<GetProjectsResponse> {
  const message: GetProjectsMessage = { type: 'GET_PROJECTS' };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as GetProjectsResponse;
}

export async function createProject(
  name: string,
): Promise<CreateProjectResponse> {
  const message: CreateProjectMessage = {
    type: 'CREATE_PROJECT',
    payload: { name },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as CreateProjectResponse;
}

export async function renameProject(
  projectId: string,
  name: string,
): Promise<RenameProjectResponse> {
  const message: RenameProjectMessage = {
    type: 'RENAME_PROJECT',
    payload: { projectId, name },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as RenameProjectResponse;
}

export async function deleteProject(
  projectId: string,
): Promise<DeleteProjectResponse> {
  const message: DeleteProjectMessage = {
    type: 'DELETE_PROJECT',
    payload: { projectId },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as DeleteProjectResponse;
}

export async function restoreLink(
  linkId: string,
): Promise<RestoreLinkResponse> {
  const message: RestoreLinkMessage = {
    type: 'RESTORE_LINK',
    payload: { linkId },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;

  assertResponse(response);

  return response as RestoreLinkResponse;
}

async function sendLifecycleMessage(
  message: ArchiveLinkMessage | UnarchiveLinkMessage | RemoveLinkMessage,
): Promise<LinkLifecycleResponse> {
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as LinkLifecycleResponse;
}

export function archiveLink(linkId: string): Promise<LinkLifecycleResponse> {
  return sendLifecycleMessage({ type: 'ARCHIVE_LINK', payload: { linkId } });
}

export function unarchiveLink(linkId: string): Promise<LinkLifecycleResponse> {
  return sendLifecycleMessage({ type: 'UNARCHIVE_LINK', payload: { linkId } });
}

export function removeLink(linkId: string): Promise<LinkLifecycleResponse> {
  return sendLifecycleMessage({ type: 'REMOVE_LINK', payload: { linkId } });
}

export async function moveLink(linkId: string, projectId: string): Promise<LinkLifecycleResponse> {
  const response = (await browser.runtime.sendMessage({
    type: 'MOVE_LINK',
    payload: { linkId, projectId },
  } satisfies MoveLinkMessage)) as unknown;
  assertResponse(response);
  return response as LinkLifecycleResponse;
}

export async function restoreSession(
  sessionId: string,
): Promise<RestoreSessionResponse> {
  const message: RestoreSessionMessage = {
    type: 'RESTORE_SESSION',
    payload: { sessionId },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as RestoreSessionResponse;
}

export async function restoreProject(
  projectId: string,
  mode: RestoreMode,
): Promise<RestoreProjectResponse> {
  const message: RestoreProjectMessage = {
    type: 'RESTORE_PROJECT',
    payload: { projectId, mode },
  };
  const response = (await browser.runtime.sendMessage(message)) as unknown;
  assertResponse(response);
  return response as RestoreProjectResponse;
}
