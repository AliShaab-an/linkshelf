import { createHash } from 'node:crypto';
import { library as phase16Library } from '../native/fixtures.mjs';

export const epoch = '2026-11-01T10:00:00.000Z';
export const FIXTURE_SEED = 326;
export function dataset(count, distribution, origin = 'https://benchmark.invalid', seed = FIXTURE_SEED) {
  if (!Number.isInteger(count) || count < 100 || count > 15000) throw new Error('Size must be an integer from 100 to 15000');
  if (distribution === 'phase16') {
    const value = phase16Library(count);
    for (const link of value.links) { link.status = 'parked'; link.url = `${origin}/scale/${link.id}`; link.normalizedUrl = link.url; }
    return value;
  }
  if (!['few', 'many'].includes(distribution)) throw new Error('Distribution must be few, many or phase16');
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const projectCount = distribution === 'few' ? 3 : Math.min(100, Math.ceil(count / 100));
  const sessionCount = distribution === 'few' ? 8 : Math.ceil((count - 10) / 5);
  const project = (id, name, isInbox = false) => ({ id, name, isInbox, createdAt: epoch, updatedAt: epoch });
  const projects = [project('inbox', 'Inbox', true), project('restore-probe', 'Synthetic restoration probe'), ...Array.from({ length: projectCount }, (_, i) => project(`project-${i}`, `Synthetic project ${i}`))];
  const sessions = Array.from({ length: sessionCount }, (_, i) => ({
    id: `session-${i}`, projectId: `project-${i % projectCount}`, note: `Synthetic session context ${i} Ω`,
    createdAt: new Date(Date.parse(epoch) + i * 60000).toISOString(), updatedAt: epoch,
  }));
  sessions.unshift({ id: 'restore-session', projectId: 'restore-probe', note: 'Ten synthetic restoration records', createdAt: epoch, updatedAt: epoch });
  const links = Array.from({ length: count }, (_, i) => {
    const group = i < 10 ? sessions[0] : sessions[1 + (i - 10) % sessionCount];
    const roll = random();
    const status = i < 10 || roll < .64 ? 'parked' : roll < .84 ? 'archived' : roll < .94 ? 'restored' : 'removed';
    return {
      id: `link-${i}`, sessionId: group.id, projectId: group.projectId,
      title: `Synthetic research item ${i} topic-${i % 17}`, url: `${origin}/item/${i}?chapter=${i % 13}`,
      normalizedUrl: `${origin}/item/${i}?chapter=${i % 13}`, domain: new URL(origin).hostname,
      note: `Synthetic note topic-${i % 23} reference-${i} Ω`, status,
      pinnedBeforeParking: i % 41 === 0, originalIndex: i % 100,
      createdAt: group.createdAt, updatedAt: epoch,
      ...(i % 137 === 0 ? { reminderAt: '2099-01-01T10:00:00.000Z', ...(i % 274 === 0 ? { reminderNotifiedAt: epoch } : {}) } : {}),
      ...(status === 'archived' ? { archivedAt: epoch } : {}), ...(status === 'restored' ? { restoredAt: epoch } : {}),
      ...(status === 'removed' ? { removedAt: epoch } : {}),
    };
  });
  return { projects, sessions, links, settings: {
    schemaVersion: 2, defaultProjectId: 'project-0', includePinnedTabsByDefault: false,
    confirmBeforeBulkClose: true, notificationsEnabled: true, defaultRestoreBehavior: 'restore-and-remove',
    displayDensity: 'compact', defaultRestoreMode: 'normal', trackingParamsToRemove: ['utm_source'],
  } };
}
export const envelope = database => ({ format: 'linkshelf-backup', schemaVersion: 2, exportedAt: epoch, database });
export function describe(database) {
  const text = JSON.stringify(database);
  return { links: database.links.length, projects: database.projects.length, sessions: database.sessions.length,
    bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'),
    states: Object.fromEntries(['parked', 'archived', 'restored', 'removed'].map(status => [status, database.links.filter(link => link.status === status).length])) };
}
