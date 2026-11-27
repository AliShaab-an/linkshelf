import { withSecondaryWarning } from '@/features/operations/secondary-result';
import {
  createSearchPages,
} from '@/features/search/search-pages';
import {
  isArchiveLinkMessage,
  isBookmarkLinkMessage,
  isCreateProjectMessage,
  isDeleteProjectMessage,
  isExportDataMessage,
  isGetCurrentWindowTabsMessage,
  isGetDueReminderLinksMessage,
  isGetArchivedLinksMessage,
  isGetBookmarkFoldersMessage,
  isGetParkedLinksMessage,
  isGetParkedSessionGroupsMessage,
  isGetProjectsMessage,
  isGetSettingsMessage,
  isImportDataMessage,
  isParkCurrentTabMessage,
  isParkSelectedTabsMessage,
  isPreviewImportDataMessage,
  isOpenBookmarkMessage,
  isRenameProjectMessage,
  isRemoveLinkMessage,
  isUndoParkedLinkMessage,
  isMoveLinkMessage,
  isRenameSessionMessage,
  isAccountMessage,
  isSetLinkTagsMessage,
  isSetLinkReminderMessage,
  isGetParkDuplicatesMessage,
  isGetSnapshotsMessage,
  isSetSnapshotsEnabledMessage,
  isDeleteSnapshotsMessage,
  isRestoreSnapshotMessage,
  isGetTagsMessage,
  isRestoreLinkMessage,
  isRestoreProjectMessage,
  isRestoreSessionMessage,
  isSearchLinksMessage,
  isUnarchiveLinkMessage,
  isTrashMessage,
  isAutoBackupMessage,
  isRatePromptMessage,
  isOpenManagerMessage,
  isUpdateSettingsMessage,
  isPatchSettingsMessage,
  isStorageRecoveryMessage,
  type ParkCurrentTabMessage,
  type ParkSelectedTabsMessage,
} from '@/messaging/contracts';
import { createReminderCoordinator } from '@/features/reminders/reminder-coordinator';
import { createBookmarkCoordinator } from '@/features/bookmarks/bookmark-coordinator';
import { OperationCoordinator, OperationInProgressError } from '@/features/operations/operation-coordinator';
import { watchTabSnapshots } from '@/features/parking/safe-tab-close';
import {
  flattenBookmarkFolders,
  searchBookmarkTree,
} from '@/features/bookmarks/bookmark-tree';
import { executeParkCurrentTab } from '@/features/parking/park-current-tab';
import { executeParkSelectedTabs } from '@/features/parking/park-selected-tabs';
import { classifyWindowTabs } from '@/features/parking/window-tabs';
import { REMINDER_ALARM_PREFIX } from '@/features/reminders/reminder-service';
import { createRestoreCoordinator } from '@/features/restoration/restore-coordinator';
import { createSnapshotService } from '@/features/snapshots/snapshot-service';
import { SnapshotStore } from '@/storage/snapshot-store';
import { SNAPSHOT_ALARM_NAME, SNAPSHOT_ALARM_PERIOD_MINUTES } from '@/domain/snapshots';
import { AUTO_BACKUP_ALARM_NAME, AUTO_BACKUP_PERIOD_MINUTES } from '@/domain/auto-backups';
import { AutoBackupStore } from '@/storage/auto-backup-store';
import { InvalidReminderError } from '@/domain/reminders';
import { createAutoBackupService } from '@/features/backups/auto-backup-service';
import type { SavedLink } from '@/domain/schemas';
import {
  SIDE_PANEL_INTENTS_KEY,
  SIDE_PANEL_INTENTS_LOCK,
  type SidePanelNavigationIntent,
} from '@/domain/side-panel';
import {
  executeSidePanelCommand,
  isPanelCommand,
} from '@/features/commands/side-panel-commands';
import { parseSearchQuery } from '@/domain/tags';
import { ChromeStorageAdapter } from '@/storage/storage-adapter';
import { RatePromptStore } from '@/storage/rate-prompt-store';
import { AccountStore } from '@/storage/account-store';
import { createAccountApi } from '@/features/account/account-api';
import { createAccountService } from '@/features/account/account-service';
import { ACCOUNT_API_BASE_URL } from '@/features/account/account-config';
import { clientNameForPlatform } from '@/domain/account';
import { RATE_PROMPT_REVIEW_URL, isRatePromptVisible } from '@/domain/rate-prompt';
import { MANAGER_PAGE_PATH, type ManagerSection, type SettingsPage } from '@/domain/manager';
import { TAB_GROUPS_PERMISSION } from '@/domain/tab-groups';
import { createTabGroups } from '@/features/tab-groups/tab-groups';
import {
  DuplicateProjectNameError,
  InvalidLinkStateError,
  InvalidProjectNameError,
  InvalidTagsError,
  InvalidSessionNameError,
  LinkNotFoundError,
  SessionNotFoundError,
  LinkShelfRepository,
  ProjectNotFoundError,
  ProtectedInboxError,
  DATABASE_STORAGE_KEY,
  StorageValidationError,
  StorageIntegrityError,
} from '@/storage/repository';

export default defineBackground(() => {
  const repository = new LinkShelfRepository(new ChromeStorageAdapter());
  const searchPages = createSearchPages(async (query) => {
    if (!query.trim()) return { results: [], bookmarks: [] };
    const [results, tree] = await Promise.all([repository.searchLinks(query), browser.bookmarks.getTree()]);
    return { results, bookmarks: parseSearchQuery(query).tags.length ? [] : searchBookmarkTree(tree, query) };
  });
  browser.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, DATABASE_STORAGE_KEY)) {
      repository.invalidateCache();
      searchPages.invalidate();
    }
  });
  for (const event of [browser.bookmarks?.onCreated, browser.bookmarks?.onRemoved,
    browser.bookmarks?.onChanged, browser.bookmarks?.onMoved, browser.bookmarks?.onChildrenReordered,
    browser.bookmarks?.onImportBegan, browser.bookmarks?.onImportEnded]) {
    event?.addListener(searchPages.invalidate);
  }
  const operations = new OperationCoordinator();
  const ratePrompt = new RatePromptStore(new ChromeStorageAdapter());
  // Account sign-in and plan; network access and the token stay in this worker.
  const accounts = createAccountService({
    store: new AccountStore(new ChromeStorageAdapter()),
    api: ACCOUNT_API_BASE_URL ? createAccountApi(ACCOUNT_API_BASE_URL) : null,
    openTab: url => browser.tabs.create({ url, active: true }),
    clientName: async () => clientNameForPlatform((await browser.runtime.getPlatformInfo?.().catch(() => undefined))?.os),
  });
  /** Counting parked tabs for the rate prompt must never affect parking itself. */
  function countParked(count: number) {
    void ratePrompt.recordParked(count).catch((error) => console.warn('LinkShelf could not update the rate prompt:', error));
  }
  const autoBackups = createAutoBackupService({
    store: new AutoBackupStore(new ChromeStorageAdapter()),
    exportBackup: () => repository.exportBackup(),
    getUsage: async () => ({
      used: await browser.storage.local.getBytesInUse(null),
      quota: browser.storage.local.QUOTA_BYTES || 10 * 1024 * 1024,
    }),
  });

  /** A daily alarm drives automatic backups; the service itself checks whether they are on. */
  async function ensureAutoBackupAlarm() {
    try {
      if (!(await browser.alarms.get(AUTO_BACKUP_ALARM_NAME))) {
        await browser.alarms.create(AUTO_BACKUP_ALARM_NAME, { delayInMinutes: 5, periodInMinutes: AUTO_BACKUP_PERIOD_MINUTES });
      }
    } catch (error) {
      console.warn('LinkShelf could not schedule automatic backups:', error);
    }
  }
  const snapshots = createSnapshotService({
    store: new SnapshotStore(new ChromeStorageAdapter()),
    windows: {
      getAll: async () => (await browser.windows.getAll({ populate: true, windowTypes: ['normal'] }))
        .map((window) => ({ windowId: window.id, // Tabs discarded before loading only expose their address as pendingUrl.
        tabs: (window.tabs ?? []).map((tab) => ({ url: tab.url || tab.pendingUrl, title: tab.title })) })),
    },
  });

  /** The alarm only exists while the opt-in feature is on. */
  async function reconcileSnapshotAlarm() {
    try {
      const { enabled } = await snapshots.summaries();
      if (!enabled) {
        await browser.alarms.clear(SNAPSHOT_ALARM_NAME);
        return;
      }
      if (!(await browser.alarms.get(SNAPSHOT_ALARM_NAME))) {
        await browser.alarms.create(SNAPSHOT_ALARM_NAME, { periodInMinutes: SNAPSHOT_ALARM_PERIOD_MINUTES });
      }
    } catch (error) {
      console.warn('LinkShelf could not update the snapshot alarm:', error);
    }
  }
  // chrome.tabGroups exists only while the optional permission is granted, so it is looked up on use.
  const tabGroups = createTabGroups({
    granted: () => browser.permissions.contains({ permissions: [TAB_GROUPS_PERMISSION] }),
    groups: () => browser.tabGroups,
    tabs: { group: (options) => browser.tabs.group(options as Parameters<typeof browser.tabs.group>[0]) },
  });
  const restoration = createRestoreCoordinator(repository, operations, browser.tabs, tabGroups);
  const bookmarking = createBookmarkCoordinator(operations, {
    getLink: (id) => repository.getLink(id),
    getTrackingParams: async () => (await repository.getSettings()).trackingParamsToRemove,
    getBookmarkTree: () => browser.bookmarks.getTree(),
    createBookmark: async (input) => {
      const bookmark = await browser.bookmarks.create(input);
      return { id: bookmark.id, parentId: bookmark.parentId, title: bookmark.title || input.title, url: bookmark.url ?? input.url };
    },
    markLinkBookmarked: (id, bookmarkId) => repository.markLinkBookmarked(id, bookmarkId),
  });
  const openPanelWindows = new Set<number>();
  const knownPanelWindows = new Set<number>();
  type PanelEvent = {
    addListener(listener: (info: { windowId: number }) => void): void;
  };
  type SidePanelApi = {
    open(options: { windowId: number }): Promise<void>;
    close?: (options: { windowId: number }) => Promise<void>;
    onOpened?: PanelEvent;
    onClosed?: PanelEvent;
  };
  const sidePanelApi = browser.sidePanel as unknown as SidePanelApi;
  const supportsPanelLifecycle = Boolean(
    sidePanelApi.close && sidePanelApi.onOpened && sidePanelApi.onClosed,
  );

  if (supportsPanelLifecycle) {
    sidePanelApi.onOpened!.addListener(({ windowId }) => {
      knownPanelWindows.add(windowId);
      openPanelWindows.add(windowId);
    });
    sidePanelApi.onClosed!.addListener(({ windowId }) => {
      knownPanelWindows.add(windowId);
      openPanelWindows.delete(windowId);
    });
  }

  async function setSidePanelIntent(
    windowId: number,
    intent: SidePanelNavigationIntent,
  ) {
    await navigator.locks.request(SIDE_PANEL_INTENTS_LOCK, async () => {
      const stored = await browser.storage.session.get(SIDE_PANEL_INTENTS_KEY);
      const current = stored[SIDE_PANEL_INTENTS_KEY];
      const intents = current && typeof current === 'object' ? current : {};
      await browser.storage.session.set({
        [SIDE_PANEL_INTENTS_KEY]: { ...intents, [String(windowId)]: intent },
      });
    });
  }

  const reminders = createReminderCoordinator({
    getDatabase: () => repository.getDatabase(),
    markNotified: (ids, reminderAt) => repository.markReminderGroupNotified(ids, reminderAt),
    alarms: browser.alarms,
    getPermission: () => browser.notifications.getPermissionLevel(),
    getNotifications: () => browser.notifications.getAll(),
    createNotification: (id, options) => browser.notifications.create(id, {
      ...options,
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      priority: 2,
      requireInteraction: true,
    }),
  });

  async function initializeExtension() {
    try {
      await repository.initialize();
      await synchronizeReminderAlarms();
    } catch (error) {
      console.error('Failed to initialize LinkShelf reminders:', error);
    }
    // Removed links are only kept for 30 days; failing here must never block startup.
    await operations.reserve(['trash'], () => repository.purgeExpiredRemovedLinks()).catch((error) => console.warn('LinkShelf could not clear expired removed links:', error));
  }

  function synchronizeReminderAlarms() {
    return reminders.reconcile();
  }

  async function selectRestoreWindow(senderWindowId?: number): Promise<number> {
    const windowId = senderWindowId ?? (await browser.windows.getLastFocused({ windowTypes: ['normal'] })).id;
    if (windowId === undefined || windowId < 0) throw new Error('Chrome did not provide a target window. Nothing was opened.');
    return windowId;
  }

  function parkCurrent(message: ParkCurrentTabMessage) {
    return operations.reserve([`tab:${message.payload.tabId}`], () => watchTabSnapshots(browser.tabs, [message.payload.tabId], (hasTabChanged) => executeParkCurrentTab(message, {
      getTab: (id) => browser.tabs.get(id), describeGroup: (id) => tabGroups.describe(id), persistTab: async (input) => { const result = await repository.parkTab(input); countParked(1); return result; }, findParkedDuplicateUrls: (urls) => repository.findParkedDuplicateUrls(urls),
      closeTab: (id) => browser.tabs.remove(id), hasTabChanged,
    })));
  }

  function parkSelected(message: ParkSelectedTabsMessage) {
    return operations.reserve(message.payload.tabIds.map((id) => `tab:${id}`), () => watchTabSnapshots(browser.tabs, message.payload.tabIds, (hasTabChanged) => executeParkSelectedTabs(message, {
      getTab: (id) => browser.tabs.get(id), describeGroup: (id) => tabGroups.describe(id), persistTabs: async (input) => { const result = await repository.parkTabs(input); countParked(result.links.length); return result; }, findParkedDuplicateUrls: (urls) => repository.findParkedDuplicateUrls(urls),
      closeTab: (id) => browser.tabs.remove(id), hasTabChanged,
    })));
  }

  async function showKeyboardResult(title: string, message: string) {
    try {
      if (await browser.notifications.getPermissionLevel() !== 'granted') return;
      await browser.notifications.create(`linkshelf-command-${Date.now()}`, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title,
        message,
        priority: 1,
      });
    } catch (error) {
      console.warn('LinkShelf could not display keyboard feedback.', error);
    }
  }

  function handleLifecycleOperation(
    operation: Promise<SavedLink>,
    sendResponse: (response: unknown) => void,
    afterSuccess?: (link: SavedLink) => Promise<void>,
  ) {
    void operation
      .then(async (link) => {
        const result = await withSecondaryWarning({ success: true as const, link, warnings: [] as string[] }, async () => { await afterSuccess?.(link); }, 'The link was updated, but reminders could not be updated. Reload LinkShelf to retry reminders.');
        sendResponse(result);
      })
      .catch((error) => {
        if (error instanceof OperationInProgressError) {
          sendResponse({ success: false, error: { code: 'OPERATION_IN_PROGRESS', message: error.message } });
          return;
        }
        if (error instanceof LinkNotFoundError) {
          sendResponse({
            success: false,
            error: { code: 'LINK_NOT_FOUND', message: error.message },
          });
          return;
        }
        if (error instanceof InvalidLinkStateError) {
          sendResponse({
            success: false,
            error: { code: 'INVALID_STATE', message: error.message },
          });
          return;
        }
        if (error instanceof ProjectNotFoundError) {
          sendResponse({
            success: false,
            error: { code: 'PROJECT_NOT_FOUND', message: error.message },
          });
          return;
        }
        console.error('Failed to update a LinkShelf link:', error);
        sendResponse({
          success: false,
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'LinkShelf could not update this link.',
          },
        });
      });
  }

  void initializeExtension();
  browser.runtime.onInstalled.addListener((details) => {
    void initializeExtension();
    if (details.reason === 'install' || details.reason === 'update') {
      void ratePrompt.begin(details.reason === 'install' ? 'new' : 'existing').catch((error) => console.warn('LinkShelf could not prepare the rate prompt:', error));
    }
    if (details.reason === 'install') {
      void browser.tabs.create({
        url: browser.runtime.getURL('/onboarding.html'),
        active: true,
      });
    }
  });
  browser.runtime.onStartup.addListener(() => {
    void initializeExtension();
    void snapshots.started().then(reconcileSnapshotAlarm);
    void autoBackups.runIfDue();
  });
  browser.windows?.onRemoved?.addListener((windowId) => void snapshots.windowClosed(windowId));
  void reconcileSnapshotAlarm();
  void ensureAutoBackupAlarm();

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SNAPSHOT_ALARM_NAME) {
      void snapshots.capture();
      return;
    }
    if (alarm.name === AUTO_BACKUP_ALARM_NAME) {
      void autoBackups.runIfDue();
      return;
    }
    if (!alarm.name.startsWith(REMINDER_ALARM_PREFIX)) return;
    void synchronizeReminderAlarms().catch((error) => console.error('Failed to reconcile LinkShelf reminders:', error));
  });
  browser.notifications.onPermissionLevelChanged?.addListener(() => {
    void synchronizeReminderAlarms().catch((error) => console.error('Failed to reconcile notification permissions:', error));
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (isPanelCommand(command)) {
      void (async () => {
        const windowId = tab?.windowId ?? (await browser.windows.getLastFocused()).id;
        if (windowId === undefined) {
          throw new Error('Chrome did not provide a window for the side panel.');
        }
        await executeSidePanelCommand(command, windowId, {
          isOpen: (candidateWindowId) => supportsPanelLifecycle && knownPanelWindows.has(candidateWindowId)
            ? openPanelWindows.has(candidateWindowId)
            : undefined,
          open: async (candidateWindowId) => {
            await sidePanelApi.open({ windowId: candidateWindowId });
            if (supportsPanelLifecycle) {
              knownPanelWindows.add(candidateWindowId);
              openPanelWindows.add(candidateWindowId);
            }
          },
          close: async (candidateWindowId) => {
            if (!sidePanelApi.close) {
              await sidePanelApi.open({ windowId: candidateWindowId });
              return;
            }
            await sidePanelApi.close({ windowId: candidateWindowId });
            knownPanelWindows.add(candidateWindowId);
            openPanelWindows.delete(candidateWindowId);
          },
          setIntent: setSidePanelIntent,
          createRequestId: () => crypto.randomUUID(),
        });
      })().catch((error) => {
        console.error('LinkShelf could not handle the side-panel shortcut:', error);
      });
      return;
    }

    if (command !== 'park-current-tab') return;

    void (async () => {
      const activeTab = tab?.id !== undefined
        ? tab
        : (await browser.tabs.query({ active: true, currentWindow: true }))[0];

      if (activeTab?.id === undefined) {
        console.warn('LinkShelf keyboard shortcut could not find the active tab.');
        await showKeyboardResult('LinkShelf could not park this tab', 'Chrome did not provide an active tab. Nothing was changed.');
        return;
      }

      const settings = await repository.getSettings();
      const response = await parkCurrent({
        type: 'PARK_CURRENT_TAB',
        payload: {
          tabId: activeTab.id,
          projectId: settings.defaultProjectId,
        },
      });

      const completed = await withSecondaryWarning(response, async () => {
            if (response.saved) await synchronizeReminderAlarms();
        }, 'The tab was saved, but reminders could not be updated. Reload LinkShelf to retry reminders.');
        if (!response.success) {
          console.warn('LinkShelf keyboard parking did not complete:', response.error.message);
          await showKeyboardResult(response.saved ? 'Tab saved but still open' : 'LinkShelf could not park this tab', [response.error.message, ...(completed.warnings ?? [])].join(' '));
        } else {
          await showKeyboardResult('Tab parked', ['The current tab was saved in your default project.', ...(completed.warnings ?? [])].join(' '));
        }
      })().catch((error) => {
        console.error('Unexpected keyboard parking failure:', error);
        void showKeyboardResult('LinkShelf could not park this tab', 'The parking result could not be confirmed. Check your shelf and open tabs before trying again.');
      });
    });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (isStorageRecoveryMessage(message)) {
        void (async () => {
          switch (message.type) {
            case 'GET_STORAGE_STATUS': return { success: true, status: await repository.getStorageStatus() };
            case 'RECHECK_STORAGE': return { success: true, status: await repository.getStorageStatus(true) };
            case 'EXPORT_RECOVERY_DATA': return { success: true, recovery: await repository.exportRecoveryData() };
            case 'PREVIEW_RECOVERY_BACKUP': return { success: true, preview: await repository.previewRecoveryBackup(message.payload.backup, message.payload.rawRevisionToken) };
            case 'RESTORE_RECOVERY_BACKUP': {
              const result = await repository.restoreRecoveryBackup(message.payload.backup, message.payload.rawRevisionToken, message.payload.revisionToken, message.payload.confirmed);
              return withSecondaryWarning({ success: true, result, warnings: [] as string[] }, synchronizeReminderAlarms, 'Your backup was restored, but reminders could not be updated. Check Today to retry reminders.');
            }
          }
        })().then(sendResponse).catch((error) => sendResponse({
          success: false,
          error: { message: error instanceof StorageValidationError || error instanceof StorageIntegrityError ? error.message : 'Local recovery could not complete. Check stored data again before trying another action.' },
        }));
        return true;
      }
      if (isAccountMessage(message)) {
        const actions = {
          ACCOUNT_GET: accounts.view,
          ACCOUNT_START_SIGN_IN: () => accounts.startSignIn('login'),
          ACCOUNT_START_SIGN_UP: accounts.startSignUp,
          ACCOUNT_POLL_SIGN_IN: accounts.pollSignIn,
          ACCOUNT_OPEN_SIGN_IN_PAGE: accounts.openSignInPage,
          ACCOUNT_CANCEL_SIGN_IN: accounts.cancelSignIn,
          ACCOUNT_REFRESH: accounts.refresh,
          ACCOUNT_SIGN_OUT: accounts.signOut,
        } satisfies Record<typeof message.type, () => Promise<unknown>>;
        void actions[message.type]().then(sendResponse).catch((error) => {
          console.error('LinkShelf account action failed:', error);
          sendResponse({ success: false, account: { status: 'signed_out' }, error: { message: 'LinkShelf could not complete this account action. Try again.' } });
        });
        return true;
      }
      if (isGetSettingsMessage(message)) {
        void Promise.all([repository.getSettings(), repository.getProjects()])
          .then(([settings, projects]) =>
            sendResponse({ success: true, settings, projects }),
          )
          .catch((error) => {
            console.error('Failed to read LinkShelf settings:', error);
            sendResponse({ success: false, error: { message: 'LinkShelf could not load settings.' } });
          });
        return true;
      }

      if (isUpdateSettingsMessage(message) || isPatchSettingsMessage(message)) {
        void repository
          .updateSettings(message.payload)
          .then(async (settings) => sendResponse(await withSecondaryWarning({ success: true as const, settings, warnings: [] as string[] }, synchronizeReminderAlarms, 'Settings were saved, but reminders could not be updated. Due reminders remain in Today.')))
          .catch((error) => {
            console.error('Failed to update LinkShelf settings:', error);
            sendResponse({ success: false, error: { message: error instanceof Error ? error.message : 'LinkShelf could not save settings.' } });
          });
        return true;
      }

      if (isExportDataMessage(message)) {
        void repository
          .exportBackup()
          .then((backup) => sendResponse({ success: true, backup }))
          .catch((error) => {
            console.error('Failed to export LinkShelf data:', error);
            sendResponse({ success: false, error: { message: error instanceof Error ? error.message : 'LinkShelf could not create the backup.' } });
          });
        return true;
      }

      if (isImportDataMessage(message)) {
        void (async () => {
          // Replacing everything is the one import that can lose data, so keep a copy first.
          if (message.payload.mode === 'replace') await autoBackups.run('before-import');
          return repository.importBackup(
            message.payload.backup,
            message.payload.mode,
            message.payload.revisionToken,
          );
        })()
          .then(async (result) => {
            sendResponse(await withSecondaryWarning({ success: true as const, result, warnings: [] as string[] }, synchronizeReminderAlarms, 'Your backup was imported, but reminders could not be updated. Reload LinkShelf to retry reminders.'));
          })
          .catch((error) => {
            console.error('Failed to import LinkShelf data:', error);
            sendResponse({
              success: false,
              error: {
                message: error instanceof Error
                  ? error.message
                  : 'LinkShelf could not import this backup.',
              },
            });
          });
        return true;
      }

      if (isPreviewImportDataMessage(message)) {
        void repository
          .previewImportBackup(message.payload.backup, message.payload.mode)
          .then((preview) => sendResponse({ success: true, preview }))
          .catch((error) => {
            console.error('Failed to preview LinkShelf import:', error);
            sendResponse({
              success: false,
              error: {
                message: error instanceof Error
                  ? error.message
                  : 'LinkShelf could not inspect this backup.',
              },
            });
          });
        return true;
      }

      if (isSearchLinksMessage(message)) {
        void searchPages.search(message.payload.query, message.payload.page)
          .then(sendResponse)
          .catch((error) => {
            console.error('Failed to search links and Chrome bookmarks:', error);
            sendResponse({
              success: false,
              error: { message: 'LinkShelf could not search saved links and bookmarks.' },
            });
          });

        return true;
      }

      if (isGetBookmarkFoldersMessage(message)) {
        void browser.bookmarks
          .getTree()
          .then((tree) =>
            sendResponse({
              success: true,
              folders: flattenBookmarkFolders(tree),
            }),
          )
          .catch((error) => {
            console.error('Failed to read Chrome bookmark folders:', error);
            sendResponse({
              success: false,
              error: { message: 'LinkShelf could not load Chrome bookmark folders.' },
            });
          });

        return true;
      }

      if (isBookmarkLinkMessage(message)) {
        void bookmarking.convert(message)
          .then(async (response) => {
            sendResponse(await withSecondaryWarning(response, async () => {
            if (response.success || response.bookmarkCreated) {
              await synchronizeReminderAlarms();
            }
          }, 'Reminders could not be updated. Check the action result and reload LinkShelf to retry reminders.'));
        })
        .catch((error) => {
          console.error('Unexpected bookmark conversion failure:', error);
          sendResponse({
            success: false,
            bookmarkCreated: false,
            error: {
              code: error instanceof OperationInProgressError ? 'OPERATION_IN_PROGRESS' : 'UNEXPECTED_ERROR',
              message: error instanceof Error ? error.message : 'LinkShelf encountered an error while creating the bookmark.',
            },
          });
        });

      return true;
    }

    if (isOpenBookmarkMessage(message)) {
      void browser.tabs
        .create({ url: message.payload.url, active: true })
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          console.error('Failed to open a Chrome bookmark:', error);
          sendResponse({
            success: false,
            error: { message: 'Chrome could not open this bookmark.' },
          });
        });

      return true;
    }

    if (isGetCurrentWindowTabsMessage(message)) {
      void browser.tabs
        .query({ currentWindow: true })
        .then((tabs) =>
          sendResponse({
            success: true,
            tabs: classifyWindowTabs(tabs),
          }),
        )
        .catch((error) => {
          console.error('Failed to read current-window tabs:', error);
          sendResponse({
            success: false,
            error: { message: 'LinkShelf could not read this window\'s tabs.' },
          });
        });

      return true;
    }

    if (isGetProjectsMessage(message)) {
      void repository
        .getProjects()
        .then((projects) => sendResponse({ success: true, projects }))
        .catch((error) => {
          console.error('Failed to read projects:', error);
          sendResponse({
            success: false,
            error: { message: 'LinkShelf could not load projects.' },
          });
        });

      return true;
    }

    if (isCreateProjectMessage(message)) {
      void repository
        .createProject({ name: message.payload.name })
        .then((project) => sendResponse({ success: true, project }))
        .catch((error) => {
          if (error instanceof InvalidProjectNameError) {
            sendResponse({
              success: false,
              error: { code: 'INVALID_NAME', message: error.message },
            });
            return;
          }

          if (error instanceof DuplicateProjectNameError) {
            sendResponse({
              success: false,
              error: { code: 'DUPLICATE_NAME', message: error.message },
            });
            return;
          }

          console.error('Failed to create a project:', error);
          sendResponse({
            success: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'LinkShelf could not create the project.',
            },
          });
        });

      return true;
    }

    if (isRenameProjectMessage(message)) {
      void repository
        .renameProject(message.payload.projectId, message.payload.name)
        .then((project) => sendResponse({ success: true, project }))
        .catch((error) => {
          if (error instanceof InvalidProjectNameError) {
            sendResponse({
              success: false,
              error: { code: 'INVALID_NAME', message: error.message },
            });
            return;
          }

          if (error instanceof DuplicateProjectNameError) {
            sendResponse({
              success: false,
              error: { code: 'DUPLICATE_NAME', message: error.message },
            });
            return;
          }

          if (error instanceof ProjectNotFoundError) {
            sendResponse({
              success: false,
              error: { code: 'PROJECT_NOT_FOUND', message: error.message },
            });
            return;
          }

          if (error instanceof ProtectedInboxError) {
            sendResponse({
              success: false,
              error: { code: 'INBOX_PROTECTED', message: error.message },
            });
            return;
          }

          console.error('Failed to rename a project:', error);
          sendResponse({
            success: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'LinkShelf could not rename the project.',
            },
          });
        });

      return true;
    }

    if (isDeleteProjectMessage(message)) {
      void repository
        .deleteProjectAndMoveToInbox(message.payload.projectId)
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error) => {
          if (error instanceof ProjectNotFoundError) {
            sendResponse({
              success: false,
              error: { code: 'PROJECT_NOT_FOUND', message: error.message },
            });
            return;
          }

          if (error instanceof ProtectedInboxError) {
            sendResponse({
              success: false,
              error: { code: 'INBOX_PROTECTED', message: error.message },
            });
            return;
          }

          console.error('Failed to delete a project:', error);
          sendResponse({
            success: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'LinkShelf could not delete the project.',
            },
          });
        });

      return true;
    }

    if (isGetParkedLinksMessage(message)) {
      void repository
        .getParkedLinks(message.payload?.projectId)
        .then((links) => sendResponse({ success: true, links }))
        .catch((error) => {
          console.error('Failed to read parked links:', error);
          sendResponse({
            success: false,
            error: { message: 'LinkShelf could not load parked links.' },
          });
        });

      return true;
    }

    if (isRatePromptMessage(message)) {
      const { action } = message.payload;
      void (async () => {
        if (action === 'get') return ratePrompt.get();
        if (action === 'rate') await browser.tabs.create({ url: RATE_PROMPT_REVIEW_URL, active: true });
        return ratePrompt.answer(action);
      })()
        .then((state) => sendResponse({ success: true, visible: isRatePromptVisible(state) }))
        .catch((error) => {
          console.error('Rate prompt request failed:', error);
          sendResponse({ success: false, error: { message: 'LinkShelf could not open the Chrome Web Store.' } });
        });
      return true;
    }

    if (isOpenManagerMessage(message)) {
      const { section, windowId, page } = message.payload;
      void openManagerTab(section, windowId, page)
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          console.error('Opening the Manager page failed:', error);
          sendResponse({ success: false, error: { message: 'LinkShelf could not open the Manager page.' } });
        });
      return true;
    }

    if (isAutoBackupMessage(message)) {
      const { action, id } = message.payload;
      void (async () => {
        if (action === 'enable') return { ...(await autoBackups.setEnabled(true)) };
        if (action === 'disable') return { ...(await autoBackups.setEnabled(false)) };
        if (action === 'delete') return { ...(await autoBackups.remove(id!)) };
        if (action === 'get') {
          const found = await autoBackups.get(id!);
          if (!found) throw new Error('This automatic backup no longer exists.');
          return { ...(await autoBackups.list()), backup: found.entry.backup };
        }
        return { ...(await autoBackups.list()) };
      })()
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error) => {
          console.error('Automatic backup request failed:', error);
          sendResponse({ success: false, error: { message: error instanceof Error && /no longer exists/.test(error.message) ? error.message : 'LinkShelf could not update automatic backups.' } });
        });
      return true;
    }

    if (isTrashMessage(message)) {
      const { action, linkId } = message.payload;
      void operations.reserve(linkId ? ['trash', `link:${linkId}`] : ['trash'], async () => {
        let affected = 0;
        if (action === 'restore') { await repository.restoreRemovedLink(linkId!); affected = 1; }
        else if (action === 'delete') affected = await repository.deleteRemovedLinks([linkId!]);
        else if (action === 'empty') affected = await repository.deleteRemovedLinks();
        else affected = await repository.purgeExpiredRemovedLinks();
        return { affected, links: await repository.getRemovedLinks() };
      })
        .then(async (result) => {
          if (action === 'restore') await synchronizeReminderAlarms().catch(() => undefined);
          sendResponse({ success: true, links: result.links, affected: result.affected, retentionDays: LinkShelfRepository.TRASH_RETENTION_DAYS });
        })
        .catch((error) => {
          console.error('Trash request failed:', error);
          sendResponse({ success: false, error: { message: error instanceof Error && /no longer exists|Only removed/.test(error.message) ? 'This link is no longer in the trash. Reload and try again.' : 'LinkShelf could not update the trash.' } });
        });
      return true;
    }

    if (isGetArchivedLinksMessage(message)) {
      void repository
        .getArchivedLinks(message.payload?.projectId)
        .then((links) => sendResponse({ success: true, links }))
        .catch((error) => {
          console.error('Failed to read archived links:', error);
          sendResponse({
            success: false,
            error: { message: 'LinkShelf could not load archived links.' },
          });
        });

      return true;
    }

    if (isGetParkedSessionGroupsMessage(message)) {
      void repository
        .getParkedSessionGroups(message.payload?.projectId)
        .then((groups) => sendResponse({ success: true, groups }))
        .catch((error) => {
          console.error('Failed to read parked sessions:', error);
          sendResponse({
            success: false,
            error: { message: 'LinkShelf could not load parking sessions.' },
          });
        });

      return true;
    }

    if (isGetDueReminderLinksMessage(message)) {
      void repository
        .getDueReminderLinks()
        .then(async (links) => sendResponse(await withSecondaryWarning({ success: true as const, links, warnings: [] as string[] }, synchronizeReminderAlarms, 'Due reminders are available, but notification delivery could not complete.')))
        .catch((error) => {
          console.error('Failed to read due reminders:', error);
          sendResponse({
            success: false,
            error: { message: 'LinkShelf could not load today\'s reminders.' },
          });
        });

      return true;
    }

    if (isRestoreLinkMessage(message)) {
      void restoration.restoreLink(message, () => selectRestoreWindow(sender.tab?.windowId))
        .then(async (response) => {
          sendResponse(await withSecondaryWarning(response, async () => {
            await synchronizeReminderAlarms();
          }, 'Reminders could not be updated. Check the action result and reload LinkShelf to retry reminders.'));
        })
        .catch((error) => {
          console.error('Unexpected restoration failure:', error);
          sendResponse({
            success: false,
            opened: false,
            error: {
              code: error instanceof OperationInProgressError ? 'OPERATION_IN_PROGRESS' : 'UNEXPECTED_ERROR',
              message: error instanceof Error ? error.message : 'LinkShelf encountered an error while restoring the link.',
            },
          });
        });

      return true;
    }

    if (isRestoreSessionMessage(message)) {
      void restoration.restoreCollection(message, () => selectRestoreWindow(sender.tab?.windowId))
        .then(async (response) => {
          sendResponse(await withSecondaryWarning(response, async () => {
            await synchronizeReminderAlarms();
          }, 'Reminders could not be updated. Check the action result and reload LinkShelf to retry reminders.'));
        })
        .catch((error) => {
          console.error('Unexpected session restoration failure:', error);
          sendResponse({
            success: false,
            opened: false,
            error: {
              code: error instanceof OperationInProgressError ? 'OPERATION_IN_PROGRESS' : 'UNEXPECTED_ERROR',
              message: error instanceof Error ? error.message : 'LinkShelf could not restore this parking session.',
            },
          });
        });

      return true;
    }

    if (isRestoreProjectMessage(message)) {
      void restoration.restoreCollection(message, () => selectRestoreWindow(sender.tab?.windowId))
        .then(async (response) => {
          sendResponse(await withSecondaryWarning(response, async () => {
            await synchronizeReminderAlarms();
          }, 'Reminders could not be updated. Check the action result and reload LinkShelf to retry reminders.'));
        })
        .catch((error) => {
          console.error('Unexpected project restoration failure:', error);
          sendResponse({
            success: false,
            opened: false,
            error: {
              code: error instanceof OperationInProgressError ? 'OPERATION_IN_PROGRESS' : 'UNEXPECTED_ERROR',
              message: error instanceof Error ? error.message : 'LinkShelf could not restore this project.',
            },
          });
        });

      return true;
    }

    if (isArchiveLinkMessage(message)) {
      handleLifecycleOperation(
        operations.reserve([`link:${message.payload.linkId}`], () => repository.archiveLink(message.payload.linkId)),
        sendResponse,
        synchronizeReminderAlarms,
      );
      return true;
    }

    if (isUnarchiveLinkMessage(message)) {
      handleLifecycleOperation(
        operations.reserve([`link:${message.payload.linkId}`], () => repository.unarchiveLink(message.payload.linkId)),
        sendResponse,
        synchronizeReminderAlarms,
      );
      return true;
    }

    if (isRemoveLinkMessage(message)) {
      handleLifecycleOperation(
        operations.reserve([`link:${message.payload.linkId}`], () => repository.removeLink(message.payload.linkId)),
        sendResponse,
        synchronizeReminderAlarms,
      );
      return true;
    }

    if (isUndoParkedLinkMessage(message)) {
      const receipt = message.payload;
      handleLifecycleOperation(
        operations.reserve([`link:${receipt.linkId}`], () => repository.undoParkedLink(receipt)),
        sendResponse,
        synchronizeReminderAlarms,
      );
      return true;
    }

    if (isMoveLinkMessage(message)) {
      handleLifecycleOperation(
        operations.reserve([`link:${message.payload.linkId}`], () => repository.moveLinkToProject(message.payload.linkId, message.payload.projectId)),
        sendResponse,
        synchronizeReminderAlarms,
      );
      return true;
    }

    if (isSetLinkReminderMessage(message)) {
      const { linkId, reminderAt } = message.payload;
      void operations.reserve([`link:${linkId}`], () => repository.setLinkReminder(linkId, reminderAt))
        .then(async (link) => {
          const warnings: string[] = [];
          await synchronizeReminderAlarms().catch((error) => {
            console.error('Failed to reconcile reminders after a change:', error);
            warnings.push('The reminder was saved, but Chrome could not schedule it. Reload LinkShelf to retry.');
          });
          sendResponse({ success: true, link, ...(warnings.length ? { warnings } : {}) });
        })
        .catch((error) => {
          const known: Array<[new (...args: never[]) => Error, string]> = [
            [OperationInProgressError, 'OPERATION_IN_PROGRESS'],
            [LinkNotFoundError, 'LINK_NOT_FOUND'],
            [InvalidLinkStateError, 'INVALID_STATE'],
            [InvalidReminderError, 'INVALID_REMINDER'],
          ];
          const match = known.find(([type]) => error instanceof type);
          if (match) {
            sendResponse({ success: false, error: { code: match[1], message: error.message } });
            return;
          }
          console.error('Failed to update link reminder:', error);
          sendResponse({ success: false, error: { code: 'UNEXPECTED_ERROR', message: 'LinkShelf could not update the reminder.' } });
        });
      return true;
    }

    if (isRenameSessionMessage(message)) {
      const { sessionId, name } = message.payload;
      void operations.reserve([`session:${sessionId}`], () => repository.renameSession(sessionId, name))
        .then((session) => sendResponse({ success: true, session }))
        .catch((error) => {
          const known: Array<[new (...args: never[]) => Error, string]> = [
            [OperationInProgressError, 'OPERATION_IN_PROGRESS'],
            [SessionNotFoundError, 'SESSION_NOT_FOUND'],
            [InvalidSessionNameError, 'INVALID_NAME'],
          ];
          const match = known.find(([type]) => error instanceof type);
          if (match) {
            sendResponse({ success: false, error: { code: match[1], message: error.message } });
            return;
          }
          console.error('Failed to rename a session:', error);
          sendResponse({ success: false, error: { code: 'UNEXPECTED_ERROR', message: 'LinkShelf could not rename the session.' } });
        });
      return true;
    }

    if (isSetLinkTagsMessage(message)) {
      const { linkId, tags } = message.payload;
      void operations.reserve([`link:${linkId}`], () => repository.setLinkTags(linkId, tags))
        .then((link) => sendResponse({ success: true, link }))
        .catch((error) => {
          const known: Array<[new (...args: never[]) => Error, string]> = [
            [OperationInProgressError, 'OPERATION_IN_PROGRESS'],
            [LinkNotFoundError, 'LINK_NOT_FOUND'],
            [InvalidLinkStateError, 'INVALID_STATE'],
            [InvalidTagsError, 'INVALID_TAGS'],
          ];
          const match = known.find(([type]) => error instanceof type);
          if (match) {
            sendResponse({ success: false, error: { code: match[1], message: error.message } });
            return;
          }
          console.error('Failed to update link tags:', error);
          sendResponse({ success: false, error: { code: 'UNEXPECTED_ERROR', message: 'LinkShelf could not update tags.' } });
        });
      return true;
    }

    if (isGetSnapshotsMessage(message) || isSetSnapshotsEnabledMessage(message) || isDeleteSnapshotsMessage(message)) {
      void (async () => {
        if (isSetSnapshotsEnabledMessage(message)) {
          const list = await snapshots.setEnabled(message.payload.enabled);
          await reconcileSnapshotAlarm();
          return list;
        }
        if (isDeleteSnapshotsMessage(message)) await snapshots.clear();
        return snapshots.summaries();
      })()
        .then((list) => sendResponse({ success: true, ...list }))
        .catch((error) => {
          console.error('Snapshot request failed:', error);
          sendResponse({ success: false, error: { message: 'LinkShelf could not update snapshots.' } });
        });
      return true;
    }

    if (isRestoreSnapshotMessage(message)) {
      void operations.reserve(['snapshot-restore'], async () => {
        const windowId = await selectRestoreWindow(sender.tab?.windowId);
        return operations.enqueue(`window:${windowId}`, () => snapshots.restore(message.payload.snapshotId, windowId, browser.tabs));
      })
        .then(sendResponse)
        .catch((error) => {
          console.error('Snapshot restoration failed:', error);
          sendResponse({
            success: false,
            opened: 0,
            error: {
              code: error instanceof OperationInProgressError ? 'OPERATION_IN_PROGRESS' : 'UNEXPECTED_ERROR',
              message: error instanceof Error ? error.message : 'LinkShelf could not restore this snapshot.',
            },
          });
        });
      return true;
    }

    if (isGetParkDuplicatesMessage(message)) {
      void (async () => {
        const tabs = (await Promise.all(message.payload.tabIds.map(async (id) => {
          try { return await browser.tabs.get(id); } catch { return undefined; }
        }))).filter((tab) => tab?.id !== undefined && tab.url);
        const duplicateUrls = new Set(await repository.findParkedDuplicateUrls(tabs.map((tab) => tab!.url!)));
        return tabs.filter((tab) => duplicateUrls.has(tab!.url!)).map((tab) => tab!.id!);
      })()
        .then((duplicateTabIds) => sendResponse({ success: true, duplicateTabIds }))
        .catch((error) => {
          console.error('Failed to check duplicates:', error);
          sendResponse({ success: false, error: { message: 'LinkShelf could not check for duplicates.' } });
        });
      return true;
    }

    if (isGetTagsMessage(message)) {
      void repository.getTagCounts()
        .then((tags) => sendResponse({ success: true, tags }))
        .catch((error) => {
          console.error('Failed to read tags:', error);
          sendResponse({ success: false, error: { message: 'LinkShelf could not load tags.' } });
        });
      return true;
    }

    if (isParkCurrentTabMessage(message)) {
      void parkCurrent(message)
        .then(async (response) => {
          sendResponse(await withSecondaryWarning(response, async () => {
            if (response.saved) await synchronizeReminderAlarms();
          }, 'Reminders could not be updated. Check the action result and reload LinkShelf to retry reminders.'));
        })
        .catch((error) => {
          console.error('Unexpected parking failure:', error);
          sendResponse({
            success: false,
            saved: false,
            closed: false,
            error: {
              code: error instanceof OperationInProgressError ? 'OPERATION_IN_PROGRESS' : 'UNEXPECTED_ERROR',
              message: error instanceof Error ? error.message : 'LinkShelf could not confirm the parking result. Check saved links and open tabs before retrying.',
            },
          });
        });

      return true;
    }

    if (isParkSelectedTabsMessage(message)) {
      void parkSelected(message)
        .then(async (response) => {
          sendResponse(await withSecondaryWarning(response, async () => {
            if (response.success) await synchronizeReminderAlarms();
          }, 'Reminders could not be updated. Check the action result and reload LinkShelf to retry reminders.'));
        })
        .catch((error) => {
          console.error('Unexpected bulk parking failure:', error);
          sendResponse({
            success: false,
            saved: false,
            closedTabIds: [],
            error: {
              code: error instanceof OperationInProgressError ? 'OPERATION_IN_PROGRESS' : 'UNEXPECTED_ERROR',
              message: error instanceof Error ? error.message : 'LinkShelf could not confirm the parking result. Check saved links and open tabs before retrying.',
            },
          });
        });

      return true;
    }

    return false;
  });
});

/** Shows the Manager page at a section, reusing an open Manager tab (preferring the caller's window). */
async function openManagerTab(section: ManagerSection, windowId?: number, page?: SettingsPage) {
  const base = browser.runtime.getURL(MANAGER_PAGE_PATH);
  const url = `${base}#${section}${section === 'settings' && page ? `/${page}` : ''}`;
  const managers = (await browser.tabs.query({})).filter(tab => tab.id !== undefined && tab.url?.startsWith(base));
  const existing = managers.find(tab => tab.windowId === windowId) ?? managers[0];
  if (!existing?.id) {
    await browser.tabs.create({ url, active: true, ...(windowId === undefined ? {} : { windowId }) });
    return;
  }
  await browser.tabs.update(existing.id, { url, active: true });
  await browser.windows.update(existing.windowId, { focused: true });
}
