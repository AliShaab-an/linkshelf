import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  LinkShelfBackupSchema,
  LinkShelfDatabaseSchema,
  migrateLinkShelfDatabase,
  parseSupportedLinkShelfBackup,
  ProjectSchema,
  SavedLinkSchema,
  type LinkShelfDatabase,
} from './schemas';

const now = '2026-08-09T12:00:00.000Z';

const validDatabase: LinkShelfDatabase = {
  projects: [
    {
      id: 'inbox-project',
      name: 'Inbox',
      isInbox: true,
      createdAt: now,
      updatedAt: now,
    },
  ],
  sessions: [],
  links: [],
  settings: {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    defaultProjectId: 'inbox-project',
    includePinnedTabsByDefault: false,
    confirmBeforeBulkClose: true,
    notificationsEnabled: true,
    defaultRestoreBehavior: 'restore-and-remove',
    displayDensity: 'comfortable',
    defaultRestoreMode: 'normal',
    trackingParamsToRemove: ['utm_source', 'utm_medium', 'utm_campaign'],
  },
};

describe('LinkShelf schemas', () => {
  it('accepts a valid empty database with an Inbox project', () => {
    expect(LinkShelfDatabaseSchema.safeParse(validDatabase).success).toBe(true);
  });

  it('rejects a project with a blank name', () => {
    const result = ProjectSchema.safeParse({
      ...validDatabase.projects[0],
      name: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('rejects timestamps that are not UTC ISO strings', () => {
    const result = ProjectSchema.safeParse({
      ...validDatabase.projects[0],
      createdAt: '2026-08-09T12:00:00',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown link status', () => {
    const result = SavedLinkSchema.safeParse({
      id: 'link-1',
      sessionId: 'session-1',
      projectId: 'inbox-project',
      title: 'Example',
      url: 'https://example.com',
      normalizedUrl: 'https://example.com',
      domain: 'example.com',
      status: 'deleted',
      pinnedBeforeParking: false,
      createdAt: now,
      updatedAt: now,
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown fields instead of silently discarding them', () => {
    const result = ProjectSchema.safeParse({
      ...validDatabase.projects[0],
      unexpected: 'value',
    });

    expect(result.success).toBe(false);
  });

  it('migrates version 1 databases and backups to version 2 defaults', () => {
    const versionOneDatabase = {
      ...validDatabase,
      settings: {
        schemaVersion: 1,
        defaultProjectId: 'inbox-project',
        includePinnedTabsByDefault: false,
        confirmBeforeBulkClose: true,
        notificationsEnabled: true,
        defaultRestoreBehavior: 'restore-and-remove',
        trackingParamsToRemove: ['utm_source'],
      },
    };
    expect(migrateLinkShelfDatabase(versionOneDatabase).settings).toMatchObject({
      schemaVersion: 2,
      displayDensity: 'comfortable',
      defaultRestoreMode: 'normal',
    });
    expect(parseSupportedLinkShelfBackup({
      format: 'linkshelf-backup',
      schemaVersion: 1,
      exportedAt: now,
      database: versionOneDatabase,
    })).toMatchObject({
      schemaVersion: 2,
      database: { settings: { schemaVersion: 2 } },
    });
  });

  it('rejects backup records with duplicate IDs', () => {
    const duplicateProject = { ...validDatabase.projects[0] };
    const result = LinkShelfBackupSchema.safeParse({
      format: 'linkshelf-backup',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: now,
      database: {
        ...validDatabase,
        projects: [validDatabase.projects[0], duplicateProject],
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a backup whose link and session belong to different projects', () => {
    const project = {
      id: 'project-2',
      name: 'Other',
      isInbox: false,
      createdAt: now,
      updatedAt: now,
    };
    const result = LinkShelfBackupSchema.safeParse({
      format: 'linkshelf-backup',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: now,
      database: {
        ...validDatabase,
        projects: [...validDatabase.projects, project],
        sessions: [{
          id: 'session-1',
          projectId: validDatabase.projects[0].id,
          createdAt: now,
          updatedAt: now,
        }],
        links: [{
          id: 'link-1',
          sessionId: 'session-1',
          projectId: project.id,
          title: 'Example',
          url: 'https://example.com',
          normalizedUrl: 'https://example.com',
          domain: 'example.com',
          status: 'parked',
          pinnedBeforeParking: false,
          createdAt: now,
          updatedAt: now,
        }],
      },
    });

    expect(result.success).toBe(false);
  });
});
