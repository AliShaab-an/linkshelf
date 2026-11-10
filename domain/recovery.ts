import { MAX_BACKUP_BYTES } from './constants';
import type { IntegrityDiagnostic } from './integrity';

export type StorageStatus =
  | { state: 'healthy'; diagnostics: [] }
  | { state: 'recovery'; diagnostics: IntegrityDiagnostic[] };

export interface RawRecoveryExport {
  format: 'linkshelf-raw-recovery';
  exportedAt: string;
  sourceKey: 'linkshelfDatabase';
  valuePresent: boolean;
  rawValue: unknown;
  diagnostics: IntegrityDiagnostic[];
  rawRevisionToken: string;
}

export function stringifyRecoveryExport(value: RawRecoveryExport): string {
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { throw new Error('The raw recovery data could not be serialized. Stored data was not changed.'); }
  if (new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('The raw recovery export exceeds the 32 MiB safety limit. Stored data was not changed; preserve it using Chrome developer tools.');
  }
  return serialized;
}

/** Compare Chrome's JSON-compatible readback without allocating JSON copies.
 * Chrome omits undefined object properties; absent and null remain distinct.
 */
export function storedValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return false;
  const keys = (value: object) => Object.keys(value).filter(key => Array.isArray(value) || (value as Record<string, unknown>)[key] !== undefined);
  const a = keys(left), b = keys(right);
  if (a.length !== b.length) return false;
  return a.every((key) => Object.hasOwn(right, key) && storedValuesEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
