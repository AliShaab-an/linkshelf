import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 2 as const;

const IdSchema = z.string().min(1);
const IsoUtcDateTimeSchema = z.iso.datetime();

export const ProjectSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1),
  description: z.string().optional(),
  color: z.string().min(1).optional(),
  isInbox: z.boolean(),
  createdAt: IsoUtcDateTimeSchema,
  updatedAt: IsoUtcDateTimeSchema,
});

export type Project = z.infer<typeof ProjectSchema>;

export const ParkingSessionSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  note: z.string().optional(),
  reminderAt: IsoUtcDateTimeSchema.optional(),
  sourceWindowId: z.number().int().optional(),
  createdAt: IsoUtcDateTimeSchema,
  updatedAt: IsoUtcDateTimeSchema,
});

export type ParkingSession = z.infer<typeof ParkingSessionSchema>;

export const LinkStatusSchema = z.enum([
  'parked',
  'archived',
  'restored',
  'removed',
]);

export type LinkStatus = z.infer<typeof LinkStatusSchema>;

export const OriginalTabGroupSchema = z.strictObject({
  title: z.string().optional(),
  color: z.string().optional(),
});

export const SavedLinkSchema = z.strictObject({
  id: IdSchema,
  sessionId: IdSchema,
  projectId: IdSchema,
  title: z.string().min(1),
  url: z.url(),
  normalizedUrl: z.url(),
  domain: z.string().min(1),
  faviconUrl: z.url().optional(),
  note: z.string().optional(),
  status: LinkStatusSchema,
  pinnedBeforeParking: z.boolean(),
  originalIndex: z.number().int().nonnegative().optional(),
  originalGroup: OriginalTabGroupSchema.optional(),
  reminderAt: IsoUtcDateTimeSchema.optional(),
  reminderNotifiedAt: IsoUtcDateTimeSchema.optional(),
  createdAt: IsoUtcDateTimeSchema,
  updatedAt: IsoUtcDateTimeSchema,
  restoredAt: IsoUtcDateTimeSchema.optional(),
  archivedAt: IsoUtcDateTimeSchema.optional(),
  removedAt: IsoUtcDateTimeSchema.optional(),
  bookmarkId: z.string().min(1).optional(),
  bookmarkedAt: IsoUtcDateTimeSchema.optional(),
});

export type SavedLink = z.infer<typeof SavedLinkSchema>;

export const RestoreBehaviorSchema = z.enum([
  'restore-and-remove',
  'open-copy',
]);

export const RestoreModeSchema = z.enum(['normal', 'unloaded']);
export type RestoreMode = z.infer<typeof RestoreModeSchema>;

export const DisplayDensitySchema = z.enum(['comfortable', 'compact']);
export type DisplayDensity = z.infer<typeof DisplayDensitySchema>;

const SettingsV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  defaultProjectId: IdSchema,
  includePinnedTabsByDefault: z.boolean(),
  confirmBeforeBulkClose: z.boolean(),
  notificationsEnabled: z.boolean(),
  defaultRestoreBehavior: RestoreBehaviorSchema,
  trackingParamsToRemove: z.array(z.string().min(1)),
});

export const SettingsSchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  defaultProjectId: IdSchema,
  includePinnedTabsByDefault: z.boolean(),
  confirmBeforeBulkClose: z.boolean(),
  notificationsEnabled: z.boolean(),
  defaultRestoreBehavior: RestoreBehaviorSchema,
  displayDensity: DisplayDensitySchema,
  defaultRestoreMode: RestoreModeSchema,
  trackingParamsToRemove: z.array(z.string().min(1)),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const LinkShelfDatabaseSchema = z.strictObject({
  projects: z.array(ProjectSchema),
  sessions: z.array(ParkingSessionSchema),
  links: z.array(SavedLinkSchema),
  settings: SettingsSchema,
});

const LinkShelfDatabaseV1Schema = z.strictObject({
  projects: z.array(ProjectSchema),
  sessions: z.array(ParkingSessionSchema),
  links: z.array(SavedLinkSchema),
  settings: SettingsV1Schema,
});

export type LinkShelfDatabase = z.infer<typeof LinkShelfDatabaseSchema>;

export function migrateLinkShelfDatabase(value: unknown): LinkShelfDatabase {
  const current = LinkShelfDatabaseSchema.safeParse(value);
  if (current.success) return current.data;

  const previous = LinkShelfDatabaseV1Schema.parse(value);
  return LinkShelfDatabaseSchema.parse({
    ...previous,
    settings: {
      ...previous.settings,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      displayDensity: 'comfortable',
      defaultRestoreMode: 'normal',
    },
  });
}

export const LinkShelfBackupSchema = z
  .strictObject({
    format: z.literal('linkshelf-backup'),
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    exportedAt: IsoUtcDateTimeSchema,
    database: LinkShelfDatabaseSchema,
  })
  .superRefine((backup, context) => {
    const projectIds = new Set(backup.database.projects.map((project) => project.id));
    const sessionIds = new Set(backup.database.sessions.map((session) => session.id));
    const linkIds = new Set(backup.database.links.map((link) => link.id));
    const sessionsById = new Map(
      backup.database.sessions.map((session) => [session.id, session]),
    );
    const inboxCount = backup.database.projects.filter((project) => project.isInbox).length;

    if (projectIds.size !== backup.database.projects.length) {
      context.addIssue({ code: 'custom', path: ['database', 'projects'], message: 'Project IDs must be unique.' });
    }
    if (sessionIds.size !== backup.database.sessions.length) {
      context.addIssue({ code: 'custom', path: ['database', 'sessions'], message: 'Session IDs must be unique.' });
    }
    if (linkIds.size !== backup.database.links.length) {
      context.addIssue({ code: 'custom', path: ['database', 'links'], message: 'Link IDs must be unique.' });
    }
    if (inboxCount !== 1) {
      context.addIssue({ code: 'custom', path: ['database', 'projects'], message: 'A backup must contain exactly one Inbox project.' });
    }
    if (!projectIds.has(backup.database.settings.defaultProjectId)) {
      context.addIssue({ code: 'custom', path: ['database', 'settings', 'defaultProjectId'], message: 'The default project is missing.' });
    }
    backup.database.sessions.forEach((session, index) => {
      if (!projectIds.has(session.projectId)) {
        context.addIssue({ code: 'custom', path: ['database', 'sessions', index, 'projectId'], message: 'The session project is missing.' });
      }
    });
    backup.database.links.forEach((link, index) => {
      if (!projectIds.has(link.projectId)) {
        context.addIssue({ code: 'custom', path: ['database', 'links', index, 'projectId'], message: 'The link project is missing.' });
      }
      if (!sessionIds.has(link.sessionId)) {
        context.addIssue({ code: 'custom', path: ['database', 'links', index, 'sessionId'], message: 'The link session is missing.' });
      }
      const session = sessionsById.get(link.sessionId);
      if (session && session.projectId !== link.projectId) {
        context.addIssue({ code: 'custom', path: ['database', 'links', index, 'projectId'], message: 'The link and its session must belong to the same project.' });
      }
    });
  });

export type LinkShelfBackup = z.infer<typeof LinkShelfBackupSchema>;

const LinkShelfBackupV1Schema = z.strictObject({
  format: z.literal('linkshelf-backup'),
  schemaVersion: z.literal(1),
  exportedAt: IsoUtcDateTimeSchema,
  database: LinkShelfDatabaseV1Schema,
});

export function parseSupportedLinkShelfBackup(value: unknown): LinkShelfBackup {
  const current = LinkShelfBackupSchema.safeParse(value);
  if (current.success) return current.data;

  const previous = LinkShelfBackupV1Schema.parse(value);
  return LinkShelfBackupSchema.parse({
    ...previous,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    database: migrateLinkShelfDatabase(previous.database),
  });
}
