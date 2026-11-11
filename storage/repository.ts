import { createEmptyDatabase, createInboxProject, INBOX_PROJECT_ID } from '@/domain/defaults';
import { stringifyBackup } from '@/domain/backup';
import {
  LinkShelfDatabaseSchema,
  LinkShelfBackupSchema,
  migrateLinkShelfDatabaseStructure,
  parseSupportedLinkShelfBackup,
  type LinkShelfBackup,
  type LinkShelfDatabase,
  type ParkingSession,
  type Project,
  type SavedLink,
  type Settings,
} from '@/domain/schemas';
import { getDomain, normalizeUrl } from '@/domain/url';
import type { StorageAdapter } from './storage-adapter';
import { getIntegrityDiagnostics, structuralDiagnostics, type IntegrityDiagnostic } from '@/domain/integrity';
import { storedValuesEqual, stringifyRecoveryExport, type RawRecoveryExport, type StorageStatus } from '@/domain/recovery';

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

export interface BackupCounts {
  projects: number;
  sessions: number;
  links: number;
  notes: number;
  reminders: number;
  linkStatuses: Record<SavedLink['status'], number>;
}

export interface ImportBackupPreview {
  mode: ImportMode;
  revisionToken: string;
  source: BackupCounts;
  current: BackupCounts;
  projectsAdded: number;
  sessionsAdded: number;
  linksAdded: number;
  recordsSkipped: number;
  conflicts: number;
  settingsAction: 'keep-current' | 'use-backup';
}

export interface ImportBackupResult {
  mode: ImportMode;
  projectsAdded: number;
  sessionsAdded: number;
  linksAdded: number;
  recordsSkipped: number;
}

export interface RecoveryBackupPreview {
  revisionToken: string;
  source: BackupCounts;
}

interface ImportPlan {
  candidate: LinkShelfDatabase;
  result: ImportBackupResult;
  conflicts: number;
}

export type SettingsUpdate = Pick<
  Settings,
  | 'defaultProjectId'
  | 'includePinnedTabsByDefault'
  | 'confirmBeforeBulkClose'
  | 'notificationsEnabled'
  | 'defaultRestoreBehavior'
  | 'displayDensity'
  | 'defaultRestoreMode'
>;

export class LinkShelfRepository {
  private operationQueue: Promise<void> = Promise.resolve();
  private databaseCache?: LinkShelfDatabase;
  private storedSnapshot?: unknown;
  private recoveryDiagnostics?: IntegrityDiagnostic[];

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

  invalidateCache(): void {
    this.databaseCache = undefined;
    this.storedSnapshot = undefined;
  }

  async getStorageStatus(recheck = false): Promise<StorageStatus> {
    return this.runExclusive(async () => {
      if (recheck) { this.recoveryDiagnostics = undefined; this.invalidateCache(); }
      try {
        await this.initializeUnsafe();
        return { state: 'healthy', diagnostics: [] };
      } catch {
        if (!this.recoveryDiagnostics) this.enterRecovery([this.diagnostic('STORAGE_UNAVAILABLE', 'Stored data could not be checked. No reset was attempted.')]);
        return { state: 'recovery', diagnostics: structuredClone(this.recoveryDiagnostics!) };
      }
    });
  }

  async exportRecoveryData(): Promise<RawRecoveryExport> {
    return this.runExclusive(async () => {
      const raw = await this.readStored();
      const result: RawRecoveryExport = {
        format: 'linkshelf-raw-recovery', exportedAt: this.now(), sourceKey: DATABASE_STORAGE_KEY,
        valuePresent: raw !== undefined, rawValue: raw ?? null,
        diagnostics: structuredClone(this.recoveryDiagnostics ?? []),
        rawRevisionToken: '0'.repeat(64),
      };
      stringifyRecoveryExport(result);
      result.rawRevisionToken = await this.rawRevision(raw);
      return result;
    });
  }

  async previewRecoveryBackup(backup: unknown, rawRevisionToken: string): Promise<RecoveryBackupPreview> {
    return this.runExclusive(async () => {
      const parsed = this.parseBackup(backup);
      const raw = await this.readStored();
      await this.requireRecoveryRevision(raw, rawRevisionToken);
      return { revisionToken: await this.createImportRevision(raw, parsed, 'replace'), source: this.countDatabase(parsed.database) };
    });
  }

  async restoreRecoveryBackup(backup: unknown, rawRevisionToken: string, revisionToken: string, confirmed: boolean): Promise<ImportBackupResult> {
    return this.runExclusive(async () => {
      if (!confirmed) throw new StorageValidationError('Save the raw recovery file and confirm replacement before restoring a backup.');
      const parsed = this.parseBackup(backup);
      const raw = await this.readStored();
      await this.requireRecoveryRevision(raw, rawRevisionToken);
      if (revisionToken !== await this.createImportRevision(raw, parsed, 'replace')) throw new StorageValidationError('The recovery preview changed. Review the backup again.');
      await this.writeValidated(parsed.database, raw, { alwaysRollback: true });
      this.recoveryDiagnostics = undefined;
      return { mode: 'replace', projectsAdded: parsed.database.projects.length, sessionsAdded: parsed.database.sessions.length, linksAdded: parsed.database.links.length, recordsSkipped: 0 };
    });
  }

  async getSettings(): Promise<Settings> {
    return (await this.getDatabase()).settings;
  }

  async updateSettings(update: SettingsUpdate): Promise<Settings> {
    const updated = await this.mutateDatabase((database) => {
      if (!database.projects.some((project) => project.id === update.defaultProjectId)) {
        throw new ProjectNotFoundError('The selected default project no longer exists.');
      }

      return { ...database, settings: { ...database.settings, ...update } };
    }, { skipIfUnchanged: true });
    return structuredClone(updated.settings);
  }

  async exportBackup(): Promise<LinkShelfBackup> {
    const backup = LinkShelfBackupSchema.parse({
      format: 'linkshelf-backup',
      schemaVersion: 2,
      exportedAt: this.now(),
      database: await this.getDatabase(),
    });
    // Every successful export must fit the same bounded importer.
    stringifyBackup(backup);
    return backup;
  }

  async previewImportBackup(
    backup: unknown,
    mode: ImportMode,
  ): Promise<ImportBackupPreview> {
    return this.runExclusive(async () => {
      const parsed = this.parseBackup(backup);
      const snapshot = structuredClone(await this.initializeUnsafe());
      const plan = this.createImportPlan(snapshot, parsed.database, mode);
      if (!plan.conflicts && !LinkShelfDatabaseSchema.safeParse(plan.candidate).success) throw new StorageValidationError('The proposed import has invalid relationships. Nothing was imported.');

      return {
        mode,
        revisionToken: await this.createImportRevision(snapshot, parsed, mode),
        source: this.countDatabase(parsed.database),
        current: this.countDatabase(snapshot),
        projectsAdded: plan.result.projectsAdded,
        sessionsAdded: plan.result.sessionsAdded,
        linksAdded: plan.result.linksAdded,
        recordsSkipped: plan.result.recordsSkipped,
        conflicts: plan.conflicts,
        settingsAction: mode === 'merge' ? 'keep-current' : 'use-backup',
      };
    });
  }

  async importBackup(
    backup: unknown,
    mode: ImportMode,
    revisionToken: string,
  ): Promise<ImportBackupResult> {
    return this.runExclusive(async () => {
      const parsed = this.parseBackup(backup);
      const state = await this.initializeStateUnsafe();
      const snapshot = structuredClone(state.database);
      const original = state.original;
      const expectedRevision = await this.createImportRevision(snapshot, parsed, mode);

      if (revisionToken !== expectedRevision) {
        throw new StorageValidationError(
          'LinkShelf data changed after the import summary was shown. Review the backup again before importing.',
        );
      }

      const plan = this.createImportPlan(snapshot, parsed.database, mode);

      if (plan.conflicts > 0) {
        throw new StorageValidationError(
          'The backup conflicts with existing LinkShelf record relationships. Nothing was imported.',
        );
      }

      await this.writeValidated(plan.candidate, original, {
        alwaysRollback: true,
        skipIfUnchanged: mode === 'merge' &&
          plan.result.projectsAdded === 0 && plan.result.sessionsAdded === 0 && plan.result.linksAdded === 0,
      });

      return plan.result;
    });
  }

  async updateDatabase(
    update: (
      current: LinkShelfDatabase,
    ) => LinkShelfDatabase | Promise<LinkShelfDatabase>,
  ): Promise<LinkShelfDatabase> {
    return this.mutateDatabase(update);
  }

  private async mutateDatabase(
    update: (current: LinkShelfDatabase) => LinkShelfDatabase | Promise<LinkShelfDatabase>,
    options?: { skipIfUnchanged: boolean },
  ): Promise<LinkShelfDatabase> {
    return this.runExclusive(async () => {
      const state = await this.initializeStateUnsafe();
      const original = state.original;
      const candidate = await update(structuredClone(state.database));

      return this.writeValidated(candidate, original, options);
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

  async markReminderGroupNotified(linkIds: readonly string[], reminderAt: string): Promise<SavedLink[]> {
    const ids = new Set(linkIds);
    let notifiedLinks: SavedLink[] = [];
    await this.updateDatabase((database) => {
      const timestamp = this.now();
      return {
        ...database,
        links: database.links.map((link) => {
          if (!ids.has(link.id) || link.status !== 'parked' || link.reminderAt !== reminderAt || link.reminderNotifiedAt) return link;
          const notified = { ...link, reminderNotifiedAt: timestamp, updatedAt: timestamp };
          notifiedLinks.push(notified);
          return notified;
        }),
      };
    });
    return notifiedLinks;
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

  private parseBackup(backup: unknown): LinkShelfBackup {
    try {
      stringifyBackup(backup);
    } catch (error) {
      throw new StorageValidationError(error instanceof Error ? error.message : 'The selected backup could not be read safely.');
    }

    try {
      return parseSupportedLinkShelfBackup(backup);
    } catch {
      throw new StorageValidationError(
        'The selected file is not a valid LinkShelf backup or uses an unsupported schema version.',
      );
    }
  }

  private createImportPlan(
    snapshot: LinkShelfDatabase,
    imported: LinkShelfDatabase,
    mode: ImportMode,
  ): ImportPlan {
    if (mode === 'replace') {
      return {
        candidate: structuredClone(imported),
        conflicts: 0,
        result: {
          mode,
          projectsAdded: imported.projects.length,
          sessionsAdded: imported.sessions.length,
          linksAdded: imported.links.length,
          recordsSkipped: 0,
        },
      };
    }

    const currentProjectIds = new Set(snapshot.projects.map((project) => project.id));
    const currentSessionsById = new Map(
      snapshot.sessions.map((session) => [session.id, session]),
    );
    const currentLinksById = new Map(snapshot.links.map((link) => [link.id, link]));
    const currentInbox = snapshot.projects.find((project) => project.isInbox)!;
    const importedInbox = imported.projects.find((project) => project.isInbox)!;
    const projectIdMap = new Map<string, string>([[importedInbox.id, currentInbox.id]]);
    let conflicts = 0;

    const projectsToAdd = imported.projects.filter((project) => {
      const mappedId = project.isInbox ? currentInbox.id : project.id;
      projectIdMap.set(project.id, mappedId);
      return !project.isInbox && !currentProjectIds.has(project.id);
    });

    const sessionsToAdd: ParkingSession[] = [];
    for (const session of imported.sessions) {
      const mappedProjectId = projectIdMap.get(session.projectId)!;
      const existing = currentSessionsById.get(session.id);

      if (existing) {
        if (existing.projectId !== mappedProjectId) conflicts += 1;
        continue;
      }

      sessionsToAdd.push({ ...session, projectId: mappedProjectId });
    }

    const availableSessions = new Map(currentSessionsById);
    sessionsToAdd.forEach((session) => availableSessions.set(session.id, session));
    const linksToAdd: SavedLink[] = [];

    for (const link of imported.links) {
      const mappedProjectId = projectIdMap.get(link.projectId)!;
      const existing = currentLinksById.get(link.id);

      if (existing) {
        if (
          existing.projectId !== mappedProjectId ||
          existing.sessionId !== link.sessionId
        ) {
          conflicts += 1;
        }
        continue;
      }

      const targetSession = availableSessions.get(link.sessionId);
      if (!targetSession || targetSession.projectId !== mappedProjectId) {
        conflicts += 1;
        continue;
      }

      linksToAdd.push({ ...link, projectId: mappedProjectId });
    }

    const totalImported =
      imported.projects.length + imported.sessions.length + imported.links.length;
    const recordsAdded =
      projectsToAdd.length + sessionsToAdd.length + linksToAdd.length;

    return {
      candidate: {
        ...snapshot,
        projects: [...snapshot.projects, ...projectsToAdd],
        sessions: [...snapshot.sessions, ...sessionsToAdd],
        links: [...snapshot.links, ...linksToAdd],
      },
      conflicts,
      result: {
        mode,
        projectsAdded: projectsToAdd.length,
        sessionsAdded: sessionsToAdd.length,
        linksAdded: linksToAdd.length,
        recordsSkipped: totalImported - recordsAdded - conflicts,
      },
    };
  }

  private countDatabase(database: LinkShelfDatabase): BackupCounts {
    const linkStatuses: BackupCounts['linkStatuses'] = {
      parked: 0,
      archived: 0,
      restored: 0,
      removed: 0,
    };

    database.links.forEach((link) => {
      linkStatuses[link.status] += 1;
    });

    return {
      projects: database.projects.length,
      sessions: database.sessions.length,
      links: database.links.length,
      notes:
        database.sessions.filter((session) => !!session.note?.trim()).length +
        database.links.filter((link) => !!link.note?.trim()).length,
      reminders: database.links.filter((link) => link.reminderAt !== undefined).length,
      linkStatuses,
    };
  }

  private async createImportRevision(
    database: unknown,
    backup: LinkShelfBackup,
    mode: ImportMode,
  ): Promise<string> {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ database, backup, mode }),
    );
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  }

  private async initializeUnsafe(): Promise<LinkShelfDatabase> {
    return (await this.initializeStateUnsafe()).database;
  }

  private async initializeStateUnsafe(): Promise<{ database: LinkShelfDatabase; original: unknown }> {
    if (this.recoveryDiagnostics) throw new StorageIntegrityError('Stored LinkShelf data requires recovery. Open LinkShelf to preserve and recover it.');
    if (this.databaseCache) return { database: this.databaseCache, original: this.storedSnapshot };
    const storedValue = await this.readStored();
    if (storedValue === undefined) {
      const database = await this.writeValidated(createEmptyDatabase(this.now()), undefined);
      return { database, original: database };
    }
    let database: LinkShelfDatabase;
    try {
      database = migrateLinkShelfDatabaseStructure(storedValue);
    } catch (error) {
      this.enterRecovery(structuralDiagnostics(error));
      throw new StorageValidationError('Stored LinkShelf data does not match a supported schema. The original was preserved.');
    }
    const candidate = this.ensureInbox(database);
    const diagnostics = getIntegrityDiagnostics(candidate);
    if (diagnostics.length) throw this.enterRecovery(diagnostics);
    const version = (storedValue as { settings: { schemaVersion: number } }).settings.schemaVersion;
    if (version !== 2 || candidate !== database) {
      const database = await this.writeValidated(candidate, storedValue);
      return { database, original: database };
    }
    const original = storedValuesEqual(storedValue, candidate) ? candidate : structuredClone(storedValue);
    this.databaseCache = candidate;
    this.storedSnapshot = original;
    // Return the precondition with the snapshot: a change event can invalidate
    // the shared cache before the awaiting operation resumes.
    return { database: candidate, original };
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

  private ensureInbox(database: LinkShelfDatabase): LinkShelfDatabase {
    const inboxes = database.projects.filter((project) => project.isInbox);
    if (inboxes.length === 0 && !database.projects.some((project) => project.id === INBOX_PROJECT_ID)) {
      const inbox = createInboxProject(this.now());
      return { ...database, projects: [...database.projects, inbox], settings: { ...database.settings, defaultProjectId: inbox.id } };
    }
    if (inboxes.length === 1 && !database.projects.some((project) => project.id === database.settings.defaultProjectId)) {
      return { ...database, settings: { ...database.settings, defaultProjectId: inboxes[0].id } };
    }
    return database;
  }

  private diagnostic(code: string, message: string): IntegrityDiagnostic {
    return { code, path: [], message };
  }

  private enterRecovery(diagnostics: IntegrityDiagnostic[]): StorageIntegrityError {
    this.invalidateCache();
    this.recoveryDiagnostics = diagnostics;
    return new StorageIntegrityError('Stored LinkShelf data requires recovery. The stored value was preserved; unsafe writes are blocked.');
  }

  private async readStored(): Promise<unknown> {
    try { return await this.storage.get(DATABASE_STORAGE_KEY); }
    catch { throw this.enterRecovery([this.diagnostic('STORAGE_UNAVAILABLE', 'Stored data could not be read. No reset was attempted.')]); }
  }

  private async rawRevision(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(value === undefined ? { valuePresent: false } : { valuePresent: true, rawValue: value }));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private async requireRecoveryRevision(raw: unknown, token: string): Promise<void> {
    if (!this.recoveryDiagnostics) throw new StorageValidationError('Recovery replacement is available only while stored data requires recovery.');
    if (!token || token !== await this.rawRevision(raw)) throw new StorageValidationError('Stored data changed after raw export. Export the current recovery data and review the backup again.');
  }

  private async writeValidated(
    database: LinkShelfDatabase,
    original: unknown,
    { alwaysRollback = false, skipIfUnchanged = false }: { alwaysRollback?: boolean; skipIfUnchanged?: boolean } = {},
  ): Promise<LinkShelfDatabase> {
    const result = LinkShelfDatabaseSchema.safeParse(database);
    if (!result.success) throw new StorageValidationError('LinkShelf refused to write data with invalid fields or relationships.');
    const before = await this.readStored();
    if (!storedValuesEqual(before, original)) throw this.enterRecovery([this.diagnostic('STORAGE_CHANGED', 'Stored data changed outside the current operation. Check it again before making changes.')]);
    // Compare against raw storage so normalization and repairs still persist.
    // Leave the cache alone in case a storage event invalidated it during the read.
    if (skipIfUnchanged &&
        storedValuesEqual((before as LinkShelfDatabase | undefined)?.settings, result.data.settings) &&
        storedValuesEqual(before, result.data)) {
      return result.data;
    }
    let writeError: unknown;
    let writeFailed = false;
    try { await this.storage.set(DATABASE_STORAGE_KEY, result.data); }
    catch (error) { writeFailed = true; writeError = error; }
    let observed: unknown;
    try { observed = await this.storage.get(DATABASE_STORAGE_KEY); }
    catch { throw this.enterRecovery([this.diagnostic('WRITE_UNVERIFIED', 'A write outcome could not be verified. Check stored data before continuing.')]); }
    if (!writeFailed && storedValuesEqual(observed, result.data)) {
      this.databaseCache = result.data;
      this.storedSnapshot = result.data;
      return result.data;
    }
    this.invalidateCache();
    if (!writeFailed || writeError === undefined || writeError === null) writeError = new StorageIntegrityError('Chrome did not confirm persisting the expected data. The write was not confirmed.');
    if (!storedValuesEqual(observed, original) && !storedValuesEqual(observed, result.data)) {
      throw this.enterRecovery([this.diagnostic('UNEXPECTED_WRITE_RESULT', 'An unexpected stored value was found after a write. It was preserved for recovery.')]);
    }
    if (alwaysRollback || !storedValuesEqual(observed, original)) {
      try {
        if (original === undefined) throw new Error('No original stored value is available for rollback.');
        await this.storage.set(DATABASE_STORAGE_KEY, original);
        const restored = await this.storage.get(DATABASE_STORAGE_KEY);
        if (!storedValuesEqual(restored, original)) throw new Error('Rollback readback differs.');
      } catch {
        this.enterRecovery([this.diagnostic('ROLLBACK_UNVERIFIED', 'The failed write could not be safely rolled back. Stored data needs attention.')]);
        throw new StorageIntegrityError('The write failed and LinkShelf could not verify rollback. Open LinkShelf recovery before making more changes.');
      }
    }
    if (writeError instanceof Error && /quota/i.test(writeError.message)) {
      throw new StorageValidationError('This operation exceeds the available Chrome storage space. The previous stored data was verified unchanged or restored.');
    }
    throw writeError;
  }
}
