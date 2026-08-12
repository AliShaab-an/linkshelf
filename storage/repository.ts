import { createEmptyDatabase, createInboxProject, INBOX_PROJECT_ID } from '@/domain/defaults';
import {
  LinkShelfDatabaseSchema,
  LinkShelfBackupSchema,
  type LinkShelfBackup,
  type LinkShelfDatabase,
  type ParkingSession,
  type Project,
  type SavedLink,
  type Settings,
} from '@/domain/schemas';
import { getDomain, normalizeUrl } from '@/domain/url';
import type { StorageAdapter } from './storage-adapter';

export const DATABASE_STORAGE_KEY = 'linkshelfDatabase';

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

export class StorageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageIntegrityError';
  }
}

export class LinkNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkNotFoundError';
  }
}

export class InvalidLinkStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLinkStateError';
  }
}

export class InvalidProjectNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProjectNameError';
  }
}

export class DuplicateProjectNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateProjectNameError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectNotFoundError';
  }
}

export class ProtectedInboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtectedInboxError';
  }
}

export interface ParkTabInput {
  projectId?: string;
  title: string;
  url: string;
  faviconUrl?: string;
  note?: string;
  reminderAt?: string;
  sourceWindowId?: number;
  pinnedBeforeParking: boolean;
  originalIndex?: number;
}

export interface ParkTabResult {
  session: ParkingSession;
  link: SavedLink;
}

export interface ParkTabsInput {
  projectId?: string;
  note?: string;
  reminderAt?: string;
  sourceWindowId?: number;
  tabs: Array<{
    title: string;
    url: string;
    faviconUrl?: string;
    pinnedBeforeParking: boolean;
    originalIndex?: number;
  }>;
}

export interface ParkTabsResult {
  session: ParkingSession;
  links: SavedLink[];
}

export interface ParkedSessionGroup {
  session: ParkingSession;
  links: SavedLink[];
}

export interface LinkSearchResult {
  link: SavedLink;
  projectName: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
}

export interface DeleteProjectResult {
  deletedProjectId: string;
  inboxProjectId: string;
  movedLinks: number;
  movedSessions: number;
}

export type ImportMode = 'merge' | 'replace';

export interface ImportBackupResult {
  mode: ImportMode;
  projectsAdded: number;
  sessionsAdded: number;
  linksAdded: number;
  recordsSkipped: number;
}

export type SettingsUpdate = Pick<
  Settings,
  | 'defaultProjectId'
  | 'includePinnedTabsByDefault'
  | 'confirmBeforeBulkClose'
  | 'notificationsEnabled'
  | 'defaultRestoreBehavior'
>;

export class LinkShelfRepository {
  private operationQueue: Promise<void> = Promise.resolve();
  private databaseCache?: LinkShelfDatabase;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async initialize(): Promise<LinkShelfDatabase> {
    return this.runExclusive(() => this.initializeUnsafe());
  }

  async getDatabase(): Promise<LinkShelfDatabase> {
    return this.initialize();
  }

  async getSettings(): Promise<Settings> {
    return (await this.getDatabase()).settings;
  }

  async updateSettings(update: SettingsUpdate): Promise<Settings> {
    let updatedSettings: Settings | undefined;

    await this.updateDatabase((database) => {
      if (!database.projects.some((project) => project.id === update.defaultProjectId)) {
        throw new ProjectNotFoundError('The selected default project no longer exists.');
      }

      updatedSettings = { ...database.settings, ...update };
      return { ...database, settings: updatedSettings };
    });

    if (!updatedSettings) {
      throw new StorageIntegrityError('LinkShelf did not update its settings.');
    }
    return updatedSettings;
  }

  async exportBackup(): Promise<LinkShelfBackup> {
    return LinkShelfBackupSchema.parse({
      format: 'linkshelf-backup',
      schemaVersion: 1,
      exportedAt: this.now(),
      database: await this.getDatabase(),
    });
  }

  async importBackup(backup: unknown, mode: ImportMode): Promise<ImportBackupResult> {
    return this.runExclusive(async () => {
      const parsed = LinkShelfBackupSchema.safeParse(backup);
      if (!parsed.success) {
        throw new StorageValidationError('The selected file is not a valid LinkShelf backup.');
      }

      const snapshot = structuredClone(await this.initializeUnsafe());
      const imported = parsed.data.database;
      let candidate: LinkShelfDatabase;
      let result: ImportBackupResult;

      if (mode === 'replace') {
        candidate = structuredClone(imported);
        result = {
          mode,
          projectsAdded: imported.projects.length,
          sessionsAdded: imported.sessions.length,
          linksAdded: imported.links.length,
          recordsSkipped: 0,
        };
      } else {
        const currentProjectIds = new Set(snapshot.projects.map((project) => project.id));
        const currentSessionIds = new Set(snapshot.sessions.map((session) => session.id));
        const currentLinkIds = new Set(snapshot.links.map((link) => link.id));
        const currentInbox = snapshot.projects.find((project) => project.isInbox)!;
        const importedInbox = imported.projects.find((project) => project.isInbox)!;
        const projectIdMap = new Map<string, string>([[importedInbox.id, currentInbox.id]]);
        const projectsToAdd = imported.projects.filter((project) => {
          if (project.isInbox || currentProjectIds.has(project.id)) {
            projectIdMap.set(project.id, project.isInbox ? currentInbox.id : project.id);
            return false;
          }
          projectIdMap.set(project.id, project.id);
          return true;
        });
        const sessionsToAdd = imported.sessions
          .filter((session) => !currentSessionIds.has(session.id))
          .map((session) => ({ ...session, projectId: projectIdMap.get(session.projectId)! }));
        const linksToAdd = imported.links
          .filter((link) => !currentLinkIds.has(link.id))
          .map((link) => ({
            ...link,
            projectId: projectIdMap.get(link.projectId)!,
          }));
        const totalImported = imported.projects.length + imported.sessions.length + imported.links.length;

        candidate = {
          ...snapshot,
          projects: [...snapshot.projects, ...projectsToAdd],
          sessions: [...snapshot.sessions, ...sessionsToAdd],
          links: [...snapshot.links, ...linksToAdd],
        };
        result = {
          mode,
          projectsAdded: projectsToAdd.length,
          sessionsAdded: sessionsToAdd.length,
          linksAdded: linksToAdd.length,
          recordsSkipped: totalImported - projectsToAdd.length - sessionsToAdd.length - linksToAdd.length,
        };
      }

      try {
        await this.writeValidated(candidate);
      } catch (error) {
        try {
          await this.writeValidated(snapshot);
        } catch (rollbackError) {
          console.error('LinkShelf could not restore its import snapshot:', rollbackError);
          throw new StorageIntegrityError('The import failed and LinkShelf could not verify rollback. Reload the extension before making more changes.');
        }
        throw error;
      }

      return result;
    });
  }

  async updateDatabase(
    update: (
      current: LinkShelfDatabase,
    ) => LinkShelfDatabase | Promise<LinkShelfDatabase>,
  ): Promise<LinkShelfDatabase> {
    return this.runExclusive(async () => {
      const current = await this.initializeUnsafe();
      const candidate = await update(structuredClone(current));

      return this.writeValidated(candidate);
    });
  }

  async parkTab(input: ParkTabInput): Promise<ParkTabResult> {
    const result = await this.parkTabs({
      projectId: input.projectId,
      note: input.note,
      reminderAt: input.reminderAt,
      sourceWindowId: input.sourceWindowId,
      tabs: [
        {
          title: input.title,
          url: input.url,
          faviconUrl: input.faviconUrl,
          pinnedBeforeParking: input.pinnedBeforeParking,
          originalIndex: input.originalIndex,
        },
      ],
    });

    return { session: result.session, link: result.links[0] };
  }

  async parkTabs(input: ParkTabsInput): Promise<ParkTabsResult> {
    if (input.tabs.length === 0) {
      throw new StorageIntegrityError('At least one tab is required for parking.');
    }

    let parkedRecords: ParkTabsResult | undefined;

    await this.updateDatabase((database) => {
      const projectId = input.projectId ?? database.settings.defaultProjectId;
      const projectExists = database.projects.some(
        (project) => project.id === projectId,
      );

      if (!projectExists) {
        throw new StorageIntegrityError(
          'The selected project does not exist in LinkShelf storage.',
        );
      }

      const timestamp = this.now();
      const note = input.note?.trim() || undefined;
      const session: ParkingSession = {
        id: this.createId(),
        projectId,
        note,
        reminderAt: input.reminderAt,
        sourceWindowId: input.sourceWindowId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const links: SavedLink[] = input.tabs.map((tab) => ({
        id: this.createId(),
        sessionId: session.id,
        projectId,
        title: tab.title || 'Untitled tab',
        url: tab.url,
        normalizedUrl: normalizeUrl(
          tab.url,
          database.settings.trackingParamsToRemove,
        ),
        domain: getDomain(tab.url),
        faviconUrl: tab.faviconUrl || undefined,
        note,
        status: 'parked',
        pinnedBeforeParking: tab.pinnedBeforeParking,
        originalIndex: tab.originalIndex,
        reminderAt: input.reminderAt,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

      parkedRecords = { session, links };

      return {
        ...database,
        sessions: [...database.sessions, session],
        links: [...database.links, ...links],
      };
    });

    if (!parkedRecords) {
      throw new StorageIntegrityError('LinkShelf did not create parked records.');
    }

    return parkedRecords;
  }

  async getProjects(): Promise<Project[]> {
    const database = await this.getDatabase();

    return [...database.projects].sort((first, second) => {
      if (first.isInbox !== second.isInbox) {
        return first.isInbox ? -1 : 1;
      }

      return first.name.localeCompare(second.name);
    });
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const name = input.name.trim();

    if (!name) {
      throw new InvalidProjectNameError('Project name cannot be blank.');
    }

    let createdProject: Project | undefined;

    await this.updateDatabase((database) => {
      const duplicateExists = database.projects.some(
        (project) => project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      );

      if (duplicateExists) {
        throw new DuplicateProjectNameError(
          'A project with this name already exists.',
        );
      }

      const timestamp = this.now();
      createdProject = {
        id: this.createId(),
        name,
        description: input.description?.trim() || undefined,
        color: input.color,
        isInbox: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return {
        ...database,
        projects: [...database.projects, createdProject],
      };
    });

    if (!createdProject) {
      throw new StorageIntegrityError('LinkShelf did not create the project.');
    }

    return createdProject;
  }

  async renameProject(projectId: string, requestedName: string): Promise<Project> {
    const name = requestedName.trim();

    if (!name) {
      throw new InvalidProjectNameError('Project name cannot be blank.');
    }

    let renamedProject: Project | undefined;

    await this.updateDatabase((database) => {
      const existingProject = database.projects.find(
        (project) => project.id === projectId,
      );

      if (!existingProject) {
        throw new ProjectNotFoundError('This project no longer exists.');
      }

      if (existingProject.isInbox) {
        throw new ProtectedInboxError('Inbox cannot be renamed.');
      }

      const duplicateExists = database.projects.some(
        (project) =>
          project.id !== projectId &&
          project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      );

      if (duplicateExists) {
        throw new DuplicateProjectNameError(
          'A project with this name already exists.',
        );
      }

      renamedProject = {
        ...existingProject,
        name,
        updatedAt: this.now(),
      };

      return {
        ...database,
        projects: database.projects.map((project) =>
          project.id === projectId ? renamedProject! : project,
        ),
      };
    });

    if (!renamedProject) {
      throw new StorageIntegrityError('LinkShelf did not rename the project.');
    }

    return renamedProject;
  }

  async deleteProjectAndMoveToInbox(
    projectId: string,
  ): Promise<DeleteProjectResult> {
    let deletionResult: DeleteProjectResult | undefined;

    await this.updateDatabase((database) => {
      const project = database.projects.find((item) => item.id === projectId);

      if (!project) {
        throw new ProjectNotFoundError('This project no longer exists.');
      }

      if (project.isInbox) {
        throw new ProtectedInboxError('Inbox cannot be deleted.');
      }

      const inboxProjects = database.projects.filter((item) => item.isInbox);

      if (inboxProjects.length !== 1) {
        throw new StorageIntegrityError(
          'LinkShelf requires exactly one Inbox before deleting a project.',
        );
      }

      const inbox = inboxProjects[0];
      const timestamp = this.now();
      const movedLinks = database.links.filter(
        (link) => link.projectId === projectId,
      ).length;
      const movedSessions = database.sessions.filter(
        (session) => session.projectId === projectId,
      ).length;

      deletionResult = {
        deletedProjectId: projectId,
        inboxProjectId: inbox.id,
        movedLinks,
        movedSessions,
      };

      return {
        ...database,
        projects: database.projects.filter((item) => item.id !== projectId),
        sessions: database.sessions.map((session) =>
          session.projectId === projectId
            ? {
                ...session,
                projectId: inbox.id,
                updatedAt: timestamp,
              }
            : session,
        ),
        links: database.links.map((link) =>
          link.projectId === projectId
            ? {
                ...link,
                projectId: inbox.id,
                updatedAt: timestamp,
              }
            : link,
        ),
        settings: {
          ...database.settings,
          defaultProjectId:
            database.settings.defaultProjectId === projectId
              ? inbox.id
              : database.settings.defaultProjectId,
        },
      };
    });

    if (!deletionResult) {
      throw new StorageIntegrityError('LinkShelf did not delete the project.');
    }

    return deletionResult;
  }

  async getParkedLinks(projectId?: string): Promise<SavedLink[]> {
    const database = await this.getDatabase();

    return database.links
      .filter(
        (link) =>
          link.status === 'parked' &&
          (projectId === undefined || link.projectId === projectId),
      )
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  async getParkedSessionGroups(
    projectId?: string,
  ): Promise<ParkedSessionGroup[]> {
    const database = await this.getDatabase();
    const parkedLinks = database.links.filter(
      (link) =>
        link.status === 'parked' &&
        (projectId === undefined || link.projectId === projectId),
    );
    const linksBySession = new Map<string, SavedLink[]>();

    for (const link of parkedLinks) {
      const sessionLinks = linksBySession.get(link.sessionId) ?? [];
      sessionLinks.push(link);
      linksBySession.set(link.sessionId, sessionLinks);
    }

    return database.sessions
      .filter((session) => linksBySession.has(session.id))
      .map((session) => ({
        session,
        links: linksBySession.get(session.id)!.sort(
          (first, second) =>
            (first.originalIndex ?? Number.MAX_SAFE_INTEGER) -
            (second.originalIndex ?? Number.MAX_SAFE_INTEGER),
        ),
      }))
      .sort((first, second) =>
        second.session.createdAt.localeCompare(first.session.createdAt),
      );
  }

  async getParkedLinksBySession(sessionId: string): Promise<SavedLink[]> {
    const database = await this.getDatabase();

    return database.links
      .filter(
        (link) => link.sessionId === sessionId && link.status === 'parked',
      )
      .sort(
        (first, second) =>
          (first.originalIndex ?? Number.MAX_SAFE_INTEGER) -
          (second.originalIndex ?? Number.MAX_SAFE_INTEGER),
      );
  }

  async getReminderLinks(): Promise<SavedLink[]> {
    const database = await this.getDatabase();

    return database.links
      .filter(
        (link) => link.status === 'parked' && link.reminderAt !== undefined,
      )
      .sort((first, second) =>
        first.reminderAt!.localeCompare(second.reminderAt!),
      );
  }

  async getDueReminderLinks(at: string = this.now()): Promise<SavedLink[]> {
    const links = await this.getReminderLinks();

    return links.filter((link) => link.reminderAt! <= at);
  }

  async getArchivedLinks(projectId?: string): Promise<SavedLink[]> {
    const database = await this.getDatabase();

    return database.links
      .filter(
        (link) =>
          link.status === 'archived' &&
          (projectId === undefined || link.projectId === projectId),
      )
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }

  async searchLinks(query: string): Promise<LinkSearchResult[]> {
    const tokens = query
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) return [];

    const database = await this.getDatabase();
    const projectNames = new Map(
      database.projects.map((project) => [project.id, project.name]),
    );

    return database.links
      .filter((link) => link.status === 'parked' || link.status === 'archived')
      .map((link) => ({
        link,
        projectName: projectNames.get(link.projectId) ?? 'Unknown project',
      }))
      .filter(({ link, projectName }) => {
        const searchableText = [
          link.title,
          link.url,
          link.domain,
          link.note ?? '',
          projectName,
        ]
          .join('\n')
          .toLocaleLowerCase();

        return tokens.every((token) => searchableText.includes(token));
      })
      .sort((first, second) =>
        second.link.updatedAt.localeCompare(first.link.updatedAt),
      );
  }

  async getLink(linkId: string): Promise<SavedLink | undefined> {
    const database = await this.getDatabase();

    return database.links.find((link) => link.id === linkId);
  }

  async moveLinkToProject(linkId: string, projectId: string): Promise<SavedLink> {
    let movedLink: SavedLink | undefined;

    await this.updateDatabase((database) => {
      const link = database.links.find((candidate) => candidate.id === linkId);
      if (!link) throw new LinkNotFoundError('The saved link no longer exists.');
      if (link.status !== 'parked') {
        throw new InvalidLinkStateError('Only parked links can move between projects.');
      }
      if (!database.projects.some((project) => project.id === projectId)) {
        throw new ProjectNotFoundError('The destination project no longer exists.');
      }
      if (link.projectId === projectId) {
        movedLink = link;
        return database;
      }

      const originalSession = database.sessions.find((session) => session.id === link.sessionId);
      if (!originalSession) {
        throw new StorageIntegrityError('The link parking session no longer exists.');
      }
      const timestamp = this.now();
      const newSession: ParkingSession = {
        ...originalSession,
        id: this.createId(),
        projectId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      movedLink = {
        ...link,
        sessionId: newSession.id,
        projectId,
        updatedAt: timestamp,
      };

      return {
        ...database,
        sessions: [...database.sessions, newSession],
        links: database.links.map((candidate) => candidate.id === linkId ? movedLink! : candidate),
      };
    });

    if (!movedLink) throw new StorageIntegrityError('LinkShelf did not move the saved link.');
    return movedLink;
  }

  async markLinkRestored(linkId: string): Promise<SavedLink> {
    let restoredLink: SavedLink | undefined;

    await this.updateDatabase((database) => {
      const existingLink = database.links.find((link) => link.id === linkId);

      if (!existingLink) {
        throw new LinkNotFoundError('The saved link no longer exists.');
      }

      if (existingLink.status !== 'parked') {
        throw new InvalidLinkStateError('Only parked links can be restored.');
      }

      const timestamp = this.now();
      restoredLink = {
        ...existingLink,
        status: 'restored',
        restoredAt: timestamp,
        updatedAt: timestamp,
      };

      return {
        ...database,
        links: database.links.map((link) =>
          link.id === linkId ? restoredLink! : link,
        ),
      };
    });

    if (!restoredLink) {
      throw new StorageIntegrityError('LinkShelf did not restore the saved link.');
    }

    return restoredLink;
  }

  async archiveLink(linkId: string): Promise<SavedLink> {
    return this.updateLinkState(
      linkId,
      ['parked'],
      (link, timestamp) => ({
        ...link,
        status: 'archived',
        archivedAt: timestamp,
        updatedAt: timestamp,
      }),
      'Only parked links can be archived.',
    );
  }

  async unarchiveLink(linkId: string): Promise<SavedLink> {
    return this.updateLinkState(
      linkId,
      ['archived'],
      (link, timestamp) => {
        const { archivedAt: _archivedAt, ...linkWithoutArchive } = link;

        return {
          ...linkWithoutArchive,
          status: 'parked',
          updatedAt: timestamp,
        };
      },
      'Only archived links can be returned to a project.',
    );
  }

  async removeLink(linkId: string): Promise<SavedLink> {
    return this.updateLinkState(
      linkId,
      ['parked', 'archived'],
      (link, timestamp) => ({
        ...link,
        status: 'removed',
        removedAt: timestamp,
        updatedAt: timestamp,
      }),
      'Only parked or archived links can be removed.',
    );
  }

  async markLinkBookmarked(
    linkId: string,
    bookmarkId: string,
  ): Promise<SavedLink> {
    return this.updateLinkState(
      linkId,
      ['parked'],
      (link, timestamp) => ({
        ...link,
        status: 'removed',
        bookmarkId,
        bookmarkedAt: timestamp,
        removedAt: timestamp,
        updatedAt: timestamp,
      }),
      'Only parked links can be converted into bookmarks.',
    );
  }

  async markReminderNotified(linkId: string): Promise<SavedLink> {
    let notifiedLink: SavedLink | undefined;

    await this.updateDatabase((database) => {
      const existingLink = database.links.find((link) => link.id === linkId);

      if (!existingLink) {
        throw new LinkNotFoundError('The saved link no longer exists.');
      }

      if (existingLink.reminderNotifiedAt) {
        notifiedLink = existingLink;
        return database;
      }

      const timestamp = this.now();
      notifiedLink = {
        ...existingLink,
        reminderNotifiedAt: timestamp,
        updatedAt: timestamp,
      };

      return {
        ...database,
        links: database.links.map((link) =>
          link.id === linkId ? notifiedLink! : link,
        ),
      };
    });

    if (!notifiedLink) {
      throw new StorageIntegrityError('LinkShelf did not update the reminder.');
    }

    return notifiedLink;
  }

  async markSessionRemindersNotified(sessionId: string): Promise<SavedLink[]> {
    let notifiedLinks: SavedLink[] = [];

    await this.updateDatabase((database) => {
      const sessionLinks = database.links.filter(
        (link) => link.sessionId === sessionId && link.reminderAt !== undefined,
      );

      if (sessionLinks.length === 0) {
        throw new LinkNotFoundError('This parking session has no reminders.');
      }

      const timestamp = this.now();
      const sessionLinkIds = new Set(sessionLinks.map((link) => link.id));
      notifiedLinks = sessionLinks.map((link) =>
        link.reminderNotifiedAt
          ? link
          : {
              ...link,
              reminderNotifiedAt: timestamp,
              updatedAt: timestamp,
            },
      );
      const notifiedById = new Map(
        notifiedLinks.map((link) => [link.id, link]),
      );

      return {
        ...database,
        links: database.links.map((link) =>
          sessionLinkIds.has(link.id) ? notifiedById.get(link.id)! : link,
        ),
      };
    });

    return notifiedLinks;
  }

  private async initializeUnsafe(): Promise<LinkShelfDatabase> {
    if (this.databaseCache) {
      return this.databaseCache;
    }

    const storedValue = await this.storage.get(DATABASE_STORAGE_KEY);

    if (storedValue === undefined) {
      const database = createEmptyDatabase(this.now());

      return this.writeValidated(database);
    }

    const database = this.parseStoredDatabase(storedValue);

    const ensuredDatabase = await this.ensureInbox(database);
    this.databaseCache = ensuredDatabase;
    return ensuredDatabase;
  }

  private async updateLinkState(
    linkId: string,
    allowedStatuses: SavedLink['status'][],
    update: (link: SavedLink, timestamp: string) => SavedLink,
    invalidStateMessage: string,
  ): Promise<SavedLink> {
    let updatedLink: SavedLink | undefined;

    await this.updateDatabase((database) => {
      const link = database.links.find((candidate) => candidate.id === linkId);

      if (!link) {
        throw new LinkNotFoundError('The saved link no longer exists.');
      }

      if (!allowedStatuses.includes(link.status)) {
        throw new InvalidLinkStateError(invalidStateMessage);
      }

      updatedLink = update(link, this.now());

      return {
        ...database,
        links: database.links.map((candidate) =>
          candidate.id === linkId ? updatedLink! : candidate,
        ),
      };
    });

    if (!updatedLink) {
      throw new StorageIntegrityError('LinkShelf did not update the saved link.');
    }

    return updatedLink;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);

    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private parseStoredDatabase(value: unknown): LinkShelfDatabase {
    const result = LinkShelfDatabaseSchema.safeParse(value);

    if (!result.success) {
      throw new StorageValidationError(
        'Stored LinkShelf data does not match the current schema.',
      );
    }

    return result.data;
  }

  private async ensureInbox(
    database: LinkShelfDatabase,
  ): Promise<LinkShelfDatabase> {
    const inboxProjects = database.projects.filter((project) => project.isInbox);

    if (inboxProjects.length > 1) {
      throw new StorageIntegrityError(
        'Stored LinkShelf data contains more than one Inbox project.',
      );
    }

    if (inboxProjects.length === 0) {
      if (database.projects.some((project) => project.id === INBOX_PROJECT_ID)) {
        throw new StorageIntegrityError(
          'The reserved Inbox project ID is already used by another project.',
        );
      }

      const inbox = createInboxProject(this.now());
      const repairedDatabase: LinkShelfDatabase = {
        ...database,
        projects: [...database.projects, inbox],
        settings: {
          ...database.settings,
          defaultProjectId: inbox.id,
        },
      };

      return this.writeValidated(repairedDatabase);
    }

    const defaultProjectExists = database.projects.some(
      (project) => project.id === database.settings.defaultProjectId,
    );

    if (!defaultProjectExists) {
      const repairedDatabase: LinkShelfDatabase = {
        ...database,
        settings: {
          ...database.settings,
          defaultProjectId: inboxProjects[0].id,
        },
      };

      return this.writeValidated(repairedDatabase);
    }

    return database;
  }

  private async writeValidated(
    database: LinkShelfDatabase,
  ): Promise<LinkShelfDatabase> {
    const result = LinkShelfDatabaseSchema.safeParse(database);

    if (!result.success) {
      throw new StorageValidationError(
        'LinkShelf refused to write data that does not match the current schema.',
      );
    }

    await this.storage.set(DATABASE_STORAGE_KEY, result.data);
    this.databaseCache = result.data;

    return result.data;
  }
}
