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
  isOpenBookmarkMessage,
  isRenameProjectMessage,
  isRemoveLinkMessage,
  isMoveLinkMessage,
  isRestoreLinkMessage,
  isRestoreProjectMessage,
  isRestoreSessionMessage,
  isSearchLinksMessage,
  isUnarchiveLinkMessage,
  isUpdateSettingsMessage,
} from '@/messaging/contracts';
import { executeBookmarkLink } from '@/features/bookmarks/bookmark-link';
import {
  flattenBookmarkFolders,
  searchBookmarkTree,
} from '@/features/bookmarks/bookmark-tree';
import { executeParkCurrentTab } from '@/features/parking/park-current-tab';
import { executeParkSelectedTabs } from '@/features/parking/park-selected-tabs';
import { classifyWindowTabs } from '@/features/parking/window-tabs';
import {
  getReminderLinkId,
  reconcileReminderAlarms,
  reminderAlarmName,
  scheduleLinkReminder,
} from '@/features/reminders/reminder-service';
import { executeRestoreLink } from '@/features/restoration/restore-link';
import { executeRestoreProject } from '@/features/restoration/restore-project';
import { executeRestoreSession } from '@/features/restoration/restore-session';
import type { SavedLink } from '@/domain/schemas';
import { ChromeStorageAdapter } from '@/storage/storage-adapter';
import {
  DuplicateProjectNameError,
  InvalidLinkStateError,
  InvalidProjectNameError,
  LinkNotFoundError,
  LinkShelfRepository,
  ProjectNotFoundError,
  ProtectedInboxError,
} from '@/storage/repository';

export default defineBackground(() => {
  const repository = new LinkShelfRepository(new ChromeStorageAdapter());

  async function showReminderNotification(link: SavedLink) {
    const database = await repository.getDatabase();
    const sessionReminderLinks = database.links.filter(
      (candidate) =>
        candidate.sessionId === link.sessionId &&
        candidate.status === 'parked' &&
        candidate.reminderAt !== undefined,
    );

    if (
      sessionReminderLinks.length === 0 ||
      sessionReminderLinks.every((candidate) => candidate.reminderNotifiedAt)
    ) {
      return;
    }

    if (!database.settings.notificationsEnabled) {
      return;
    }

    const permissionLevel = await browser.notifications.getPermissionLevel();

    if (permissionLevel !== 'granted') {
      console.warn(
        'LinkShelf could not display a reminder because Chrome notifications are disabled.',
      );
      return;
    }

    const project = database.projects.find(
      (candidate) => candidate.id === link.projectId,
    );
    const notificationMessage =
      link.note ||
      (sessionReminderLinks.length === 1
        ? link.title
        : `${sessionReminderLinks.length} parked tabs are ready to review.`);

    await browser.notifications.create(reminderAlarmName(link.sessionId), {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title:
        sessionReminderLinks.length === 1
          ? 'LinkShelf reminder'
          : `LinkShelf reminder: ${project?.name ?? 'Parked tabs'}`,
      message: notificationMessage.slice(0, 250),
      contextMessage:
        sessionReminderLinks.length === 1
          ? link.domain
          : `${sessionReminderLinks.length} links`,
      priority: 2,
      requireInteraction: true,
    });
    await repository.markSessionRemindersNotified(link.sessionId);
  }

  async function initializeExtension() {
    try {
      await repository.initialize();
      const reminderLinks = await repository.getReminderLinks();

      await reconcileReminderAlarms(reminderLinks, browser.alarms);

      const now = new Date().toISOString();
      const missedLinks = reminderLinks.filter(
        (link) =>
          link.reminderAt! <= now && link.reminderNotifiedAt === undefined,
      );

      for (const link of missedLinks) {
        await showReminderNotification(link);
      }
    } catch (error) {
      console.error('Failed to initialize LinkShelf:', error);
    }
  }

  async function synchronizeReminderAlarms() {
    await reconcileReminderAlarms(
      await repository.getReminderLinks(),
      browser.alarms,
    );
  }

  async function showKeyboardResult(title: string, message: string) {
    if (await browser.notifications.getPermissionLevel() !== 'granted') return;
    await browser.notifications.create(`linkshelf-command-${Date.now()}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
      priority: 1,
    });
  }

  function handleLifecycleOperation(
    operation: Promise<SavedLink>,
    sendResponse: (response: unknown) => void,
    afterSuccess?: (link: SavedLink) => Promise<void>,
  ) {
    void operation
      .then(async (link) => {
        await afterSuccess?.(link);
        sendResponse({ success: true, link });
      })
      .catch((error) => {
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
    if (details.reason === 'install') {
      void browser.tabs.create({
        url: browser.runtime.getURL('/onboarding.html'),
        active: true,
      });
    }
  });
  browser.runtime.onStartup.addListener(() => void initializeExtension());

  browser.alarms.onAlarm.addListener((alarm) => {
    const linkId = getReminderLinkId(alarm.name);

    if (!linkId) {
      return;
    }

    void repository
      .getLink(linkId)
      .then(async (link) => {
        if (
          !link ||
          link.status !== 'parked' ||
          !link.reminderAt ||
          link.reminderAt > new Date().toISOString()
        ) {
          return;
        }

        await showReminderNotification(link);
      })
      .catch((error) => {
        console.error('Failed to show a LinkShelf reminder:', error);
      });
  });

  browser.commands.onCommand.addListener((command, tab) => {
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
      const response = await executeParkCurrentTab({
        type: 'PARK_CURRENT_TAB',
        payload: {
          tabId: activeTab.id,
          projectId: settings.defaultProjectId,
        },
      }, {
        getTab: (tabId) => browser.tabs.get(tabId),
        persistTab: (input) => repository.parkTab(input),
        closeTab: (tabId) => browser.tabs.remove(tabId),
      });

      if (response.saved && response.linkId) {
        const link = await repository.getLink(response.linkId);
        if (link) await scheduleLinkReminder(link, browser.alarms);
      }
      if (!response.success) {
        console.warn('LinkShelf keyboard parking did not complete:', response.error.message);
        await showKeyboardResult('LinkShelf could not park this tab', response.error.message);
      } else {
        await showKeyboardResult('Tab parked', 'The current tab was saved in your default project.');
      }
    })().catch((error) => {
      console.error('Unexpected keyboard parking failure:', error);
      void showKeyboardResult('LinkShelf could not park this tab', 'An unexpected error occurred. The tab stayed open.');
    });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

    if (isUpdateSettingsMessage(message)) {
      void repository
        .updateSettings(message.payload)
        .then((settings) => sendResponse({ success: true, settings }))
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
          sendResponse({ success: false, error: { message: 'LinkShelf could not create the backup.' } });
        });
      return true;
    }

    if (isImportDataMessage(message)) {
      void repository
        .importBackup(message.payload.backup, message.payload.mode)
        .then(async (result) => {
          await synchronizeReminderAlarms();
          sendResponse({ success: true, result });
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

    if (isSearchLinksMessage(message)) {
      void Promise.all([
        repository.searchLinks(message.payload.query),
        browser.bookmarks.getTree(),
      ])
        .then(([results, tree]) =>
          sendResponse({
            success: true,
            results,
            bookmarks: searchBookmarkTree(tree, message.payload.query),
          }),
        )
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
      void executeBookmarkLink(message, {
        getLink: (linkId) => repository.getLink(linkId),
        getTrackingParams: async () =>
          (await repository.getDatabase()).settings.trackingParamsToRemove,
        getBookmarkTree: () => browser.bookmarks.getTree(),
        createBookmark: async (input) => {
          const bookmark = await browser.bookmarks.create(input);
          return {
            id: bookmark.id,
            parentId: bookmark.parentId,
            title: bookmark.title || input.title,
            url: bookmark.url ?? input.url,
          };
        },
        markLinkBookmarked: (linkId, bookmarkId) =>
          repository.markLinkBookmarked(linkId, bookmarkId),
      })
        .then(async (response) => {
          if (response.success || response.bookmarkCreated) {
            await synchronizeReminderAlarms();
          }
          sendResponse(response);
        })
        .catch((error) => {
          console.error('Unexpected bookmark conversion failure:', error);
          sendResponse({
            success: false,
            bookmarkCreated: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'LinkShelf encountered an error while creating the bookmark.',
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
        .then((links) => sendResponse({ success: true, links }))
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
      void executeRestoreLink(message, {
        getLink: (linkId) => repository.getLink(linkId),
        openTab: async (url) => {
          await browser.tabs.create({ url, active: true });
        },
        markLinkRestored: (linkId) => repository.markLinkRestored(linkId),
      })
        .then(async (response) => {
          if (response.success) {
            await browser.alarms.clear(reminderAlarmName(response.linkId));
            await reconcileReminderAlarms(
              await repository.getReminderLinks(),
              browser.alarms,
            );
          }

          sendResponse(response);
        })
        .catch((error) => {
          console.error('Unexpected restoration failure:', error);
          sendResponse({
            success: false,
            opened: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'LinkShelf encountered an error while restoring the link.',
            },
          });
        });

      return true;
    }

    if (isRestoreSessionMessage(message)) {
      void executeRestoreSession(message, {
        getParkedLinks: (sessionId) =>
          repository.getParkedLinksBySession(sessionId),
        openTab: async (url) => {
          await browser.tabs.create({ url, active: false });
        },
        markLinkRestored: (linkId) => repository.markLinkRestored(linkId),
      })
        .then(async (response) => {
          await reconcileReminderAlarms(
            await repository.getReminderLinks(),
            browser.alarms,
          );
          sendResponse(response);
        })
        .catch((error) => {
          console.error('Unexpected session restoration failure:', error);
          sendResponse({
            success: false,
            opened: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'LinkShelf could not restore this parking session.',
            },
          });
        });

      return true;
    }

    if (isRestoreProjectMessage(message)) {
      void executeRestoreProject(message, {
        getParkedLinks: async (projectId) =>
          (await repository.getParkedSessionGroups(projectId)).flatMap(
            (group) => group.links,
          ),
        openTab: async (url) => {
          await browser.tabs.create({ url, active: false });
        },
        markLinkRestored: (linkId) => repository.markLinkRestored(linkId),
      })
        .then(async (response) => {
          await reconcileReminderAlarms(
            await repository.getReminderLinks(),
            browser.alarms,
          );
          sendResponse(response);
        })
        .catch((error) => {
          console.error('Unexpected project restoration failure:', error);
          sendResponse({
            success: false,
            opened: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'LinkShelf could not restore this project.',
            },
          });
        });

      return true;
    }

    if (isArchiveLinkMessage(message)) {
      handleLifecycleOperation(
        repository.archiveLink(message.payload.linkId),
        sendResponse,
        synchronizeReminderAlarms,
      );
      return true;
    }

    if (isUnarchiveLinkMessage(message)) {
      handleLifecycleOperation(
        repository.unarchiveLink(message.payload.linkId),
        sendResponse,
        async (link) => {
          await synchronizeReminderAlarms();
          if (
            link.reminderAt &&
            link.reminderAt <= new Date().toISOString() &&
            !link.reminderNotifiedAt
          ) {
            await showReminderNotification(link);
          }
        },
      );
      return true;
    }

    if (isRemoveLinkMessage(message)) {
      handleLifecycleOperation(
        repository.removeLink(message.payload.linkId),
        sendResponse,
        synchronizeReminderAlarms,
      );
      return true;
    }

    if (isMoveLinkMessage(message)) {
      handleLifecycleOperation(
        repository.moveLinkToProject(message.payload.linkId, message.payload.projectId),
        sendResponse,
      );
      return true;
    }

    if (isParkCurrentTabMessage(message)) {
      void executeParkCurrentTab(message, {
        getTab: (tabId) => browser.tabs.get(tabId),
        persistTab: (input) => repository.parkTab(input),
        closeTab: (tabId) => browser.tabs.remove(tabId),
      })
        .then(async (response) => {
          if (response.saved && response.linkId) {
            const link = await repository.getLink(response.linkId);

            if (link) {
              await scheduleLinkReminder(link, browser.alarms);
            }
          }

          sendResponse(response);
        })
        .catch((error) => {
          console.error('Unexpected parking failure:', error);
          sendResponse({
            success: false,
            saved: false,
            closed: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'The tab stayed open because LinkShelf encountered an error.',
            },
          });
        });

      return true;
    }

    if (isParkSelectedTabsMessage(message)) {
      void executeParkSelectedTabs(message, {
        getTab: (tabId) => browser.tabs.get(tabId),
        persistTabs: (input) => repository.parkTabs(input),
        closeTab: (tabId) => browser.tabs.remove(tabId),
      })
        .then(async (response) => {
          if (response.success && response.linkIds.length > 0) {
            const reminderLink = await repository.getLink(response.linkIds[0]);

            if (reminderLink) {
              await scheduleLinkReminder(reminderLink, browser.alarms);
            }
          }

          sendResponse(response);
        })
        .catch((error) => {
          console.error('Unexpected bulk parking failure:', error);
          sendResponse({
            success: false,
            saved: false,
            closedTabIds: [],
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'All tabs stayed open because LinkShelf encountered an error.',
            },
          });
        });

      return true;
    }

    return false;
  });
});
