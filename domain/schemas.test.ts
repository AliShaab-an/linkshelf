import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  LinkShelfDatabaseSchema,
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
});
