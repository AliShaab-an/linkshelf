import { BACKUP_SIZE_LIMIT_LABEL, MAX_BACKUP_BYTES } from './constants';
import { parseSupportedLinkShelfBackup, type LinkShelfBackup } from './schemas';

export function stringifyBackup(value: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('The backup could not be serialized safely.');
  }
  if (serialized === undefined) throw new Error('The backup contains no readable data.');
  if (new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) {
    throw new Error(`The backup exceeds the ${BACKUP_SIZE_LIMIT_LABEL} safety limit. No data was changed.`);
  }
  return serialized;
}

export async function readBackupFile(file: Pick<File, 'size' | 'text'>): Promise<LinkShelfBackup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error(`Choose a LinkShelf JSON backup of ${BACKUP_SIZE_LIMIT_LABEL} or less.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error('This file could not be read as JSON. Choose a complete, unmodified LinkShelf backup.');
  }
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value &&
    value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error('This backup uses an unsupported schema version. Update LinkShelf or choose a supported version-1 or version-2 backup.');
  }
  try {
    return parseSupportedLinkShelfBackup(value);
  } catch {
    throw new Error('This file is not a valid LinkShelf backup, is corrupted, or uses an unsupported version.');
  }
}
