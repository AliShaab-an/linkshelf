import type { SavedLink } from './schemas';

export type RestoreIdentity = Pick<SavedLink, 'id' | 'url' | 'createdAt' | 'projectId' | 'sessionId'>;

export function restoreIdentity({ id, url, createdAt, projectId, sessionId }: RestoreIdentity): RestoreIdentity {
  return { id, url, createdAt, projectId, sessionId };
}

export function sameRestoreIdentity(a: RestoreIdentity, b: RestoreIdentity): boolean {
  return a.id === b.id && a.url === b.url && a.createdAt === b.createdAt &&
    a.projectId === b.projectId && a.sessionId === b.sessionId;
}
