import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRACKING_PARAMS,
  INBOX_PROJECT_ID,
  createEmptyDatabase,
} from './defaults';
import { LinkShelfDatabaseSchema } from './schemas';

const now = '2026-08-09T12:00:00.000Z';

describe('default LinkShelf data', () => {
  it('creates a database accepted by the current schema', () => {
    const database = createEmptyDatabase(now);

    expect(LinkShelfDatabaseSchema.safeParse(database).success).toBe(true);
  });

  it('creates exactly one permanent Inbox project', () => {
    const database = createEmptyDatabase(now);
    const inboxProjects = database.projects.filter((project) => project.isInbox);

    expect(inboxProjects).toHaveLength(1);
    expect(inboxProjects[0]).toMatchObject({
      id: INBOX_PROJECT_ID,
      name: 'Inbox',
      createdAt: now,
      updatedAt: now,
    });
  });

  it('uses Inbox as the default project', () => {
    const database = createEmptyDatabase(now);

    expect(database.settings.defaultProjectId).toBe(INBOX_PROJECT_ID);
  });

  it('starts with no sessions or saved links', () => {
    const database = createEmptyDatabase(now);

    expect(database.sessions).toEqual([]);
    expect(database.links).toEqual([]);
  });

  it('creates independent tracking-parameter arrays', () => {
    const firstDatabase = createEmptyDatabase(now);
    const secondDatabase = createEmptyDatabase(now);

    firstDatabase.settings.trackingParamsToRemove.push('custom_tracking');

    expect(secondDatabase.settings.trackingParamsToRemove).toEqual(
      DEFAULT_TRACKING_PARAMS,
    );
  });
});
