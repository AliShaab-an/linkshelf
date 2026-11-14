import { z } from 'zod';
import { getIntegrityDiagnostics } from './integrity';

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

export const SettingsPatchSchema = SettingsSchema.pick({
  defaultProjectId: true,
  notificationsEnabled: true,
  defaultRestoreBehavior: true,
  displayDensity: true,
  defaultRestoreMode: true,
}).partial().refine((patch) => {
  const values = Object.values(patch);
  return values.length > 0 && values.every(value => value !== undefined);
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const LinkShelfDatabaseStructureSchema = z.strictObject({
  projects: z.array(ProjectSchema),
  sessions: z.array(ParkingSessionSchema),
  links: z.array(SavedLinkSchema),
  settings: SettingsSchema,
});

export const LinkShelfDatabaseSchema = LinkShelfDatabaseStructureSchema.superRefine((database, context) => {
  for (const issue of getIntegrityDiagnostics(database)) {
    context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  }
});

const LinkShelfDatabaseV1Schema = z.strictObject({
  projects: z.array(ProjectSchema),
  sessions: z.array(ParkingSessionSchema),
  links: z.array(SavedLinkSchema),
  settings: SettingsV1Schema,
});

export type LinkShelfDatabase = z.infer<typeof LinkShelfDatabaseSchema>;

export function migrateLinkShelfDatabaseStructure(value: unknown): LinkShelfDatabase {
  const version = value && typeof value === 'object' && 'settings' in value && value.settings && typeof value.settings === 'object' && 'schemaVersion' in value.settings
    ? value.settings.schemaVersion : undefined;
  if (version !== 1) return LinkShelfDatabaseStructureSchema.parse(value);
  const previous = LinkShelfDatabaseV1Schema.parse(value);
  return {
    ...previous,
    settings: {
      ...previous.settings,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      displayDensity: 'comfortable',
      defaultRestoreMode: 'normal',
    },
  };
}

export function migrateLinkShelfDatabase(value: unknown): LinkShelfDatabase {
  return LinkShelfDatabaseSchema.parse(migrateLinkShelfDatabaseStructure(value));
}

export const LinkShelfBackupSchema = z
  .strictObject({
    format: z.literal('linkshelf-backup'),
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    exportedAt: IsoUtcDateTimeSchema,
    database: LinkShelfDatabaseSchema,
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
    database: migrateLinkShelfDatabaseStructure(previous.database),
  });
}
