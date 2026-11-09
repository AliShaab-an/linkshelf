export const INBOX_PROJECT_ID = 'inbox';
// Allows formatting overhead above Chrome's default 10 MiB local-storage quota,
// while bounding file reads, JSON parsing, and runtime-message payloads.
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const BACKUP_SIZE_LIMIT_LABEL = '32 MiB';
