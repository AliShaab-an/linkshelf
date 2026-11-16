import { INBOX_PROJECT_ID } from './constants';

export interface IntegrityDiagnostic {
  code: string;
  path: Array<string | number>;
  message: string;
}

interface RelationalDatabase {
  projects: Array<{ id: string; isInbox: boolean }>;
  sessions: Array<{ id: string; projectId: string }>;
  links: Array<{ id: string; projectId: string; sessionId: string }>;
  settings: { defaultProjectId: string };
}

export function structuralDiagnostics(error: unknown): IntegrityDiagnostic[] {
  const fields = new Set(['projects', 'sessions', 'links', 'settings', 'id', 'name', 'description', 'color', 'isInbox', 'createdAt', 'updatedAt', 'projectId', 'sessionId', 'note', 'reminderAt', 'reminderNotifiedAt', 'sourceWindowId', 'title', 'url', 'normalizedUrl', 'domain', 'status', 'pinnedBeforeParking', 'originalIndex', 'originalGroup', 'faviconUrl', 'restoredAt', 'archivedAt', 'removedAt', 'bookmarkId', 'bookmarkedAt', 'schemaVersion', 'defaultProjectId', 'includePinnedTabsByDefault', 'confirmBeforeBulkClose', 'notificationsEnabled', 'defaultRestoreBehavior', 'displayDensity', 'defaultRestoreMode', 'trackingParamsToRemove']);
  const issues = error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues) ? error.issues : [];
  const diagnostics = issues.slice(0, 20).map((issue: { path?: unknown[] }) => ({
    code: 'INVALID_STRUCTURE',
    path: (issue.path ?? []).filter((part): part is string | number => typeof part === 'number' || (typeof part === 'string' && fields.has(part))),
    message: 'A required stored field is missing, invalid, or unsupported.',
  }));
  return diagnostics.length ? diagnostics : [{ code: 'INVALID_STRUCTURE', path: [], message: 'Stored data has an invalid structure or unsupported schema version.' }];
}

/** Fixed messages and positional paths never include URLs, notes, names, or actual IDs. */
export function getIntegrityDiagnostics(database: RelationalDatabase): IntegrityDiagnostic[] {
  const issues: IntegrityDiagnostic[] = [];
  const add = (code: string, path: Array<string | number>, message: string) => {
    if (issues.length < 100) issues.push({ code, path, message });
  };
  function ids(records: Array<{ id: string }>, name: 'projects' | 'sessions' | 'links') {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      if (seen.has(record.id)) add(`DUPLICATE_${name.toUpperCase()}_ID`, [name, index, 'id'], `${name} contain duplicate IDs.`);
      seen.add(record.id);
    });
    return seen;
  }
  const projectIds = ids(database.projects, 'projects');
  const sessionIds = ids(database.sessions, 'sessions');
  ids(database.links, 'links');
  const sessions = new Map(database.sessions.map((session) => [session.id, session]));
  if (database.projects.filter((project) => project.isInbox).length !== 1) {
    add('INBOX_COUNT', ['projects'], 'Exactly one Inbox project is required.');
  }
  database.projects.forEach((project, index) => {
    if (project.id === INBOX_PROJECT_ID && !project.isInbox) {
      add('RESERVED_INBOX_ID', ['projects', index, 'isInbox'], 'The reserved Inbox ID cannot belong to a normal project.');
    }
  });
  if (!projectIds.has(database.settings.defaultProjectId)) add('DEFAULT_PROJECT_MISSING', ['settings', 'defaultProjectId'], 'The default project is missing.');
  database.sessions.forEach((session, index) => {
    if (!projectIds.has(session.projectId)) add('SESSION_PROJECT_MISSING', ['sessions', index, 'projectId'], 'A session references a missing project.');
  });
  database.links.forEach((link, index) => {
    if (!projectIds.has(link.projectId)) add('LINK_PROJECT_MISSING', ['links', index, 'projectId'], 'A link references a missing project.');
    if (!sessionIds.has(link.sessionId)) add('LINK_SESSION_MISSING', ['links', index, 'sessionId'], 'A link references a missing session.');
    const session = sessions.get(link.sessionId);
    if (session && session.projectId !== link.projectId) add('LINK_PROJECT_MISMATCH', ['links', index, 'projectId'], 'A link and its session belong to different projects.');
  });
  return issues;
}
