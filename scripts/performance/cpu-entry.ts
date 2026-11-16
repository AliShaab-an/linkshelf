import { LinkShelfRepository } from '../../storage/repository';
import { LinkShelfDatabaseSchema, LinkShelfBackupSchema, type LinkShelfDatabase, type SavedLink } from '../../domain/schemas';
import { getIntegrityDiagnostics } from '../../domain/integrity';
import { storedValuesEqual } from '../../domain/recovery';
import { readBackupFile } from '../../domain/backup';
import { groupPendingReminders } from '../../features/reminders/reminder-service';

// A separate bundled benchmark page, never an application entrypoint.
let data: LinkShelfDatabase;
let copy: LinkShelfDatabase;
let text: string;
let backupText: string;
let repository: LinkShelfRepository;
let preparedGroups: Map<string, SavedLink[]>;
const api = {
  async setup(value: LinkShelfDatabase) {
    data = value;
    copy = structuredClone(value);
    text = JSON.stringify(value);
    backupText = JSON.stringify({ format: 'linkshelf-backup', schemaVersion: 2, exportedAt: '2026-11-01T10:00:00.000Z', database: value });
    repository = new LinkShelfRepository({ get: async () => data, set: async () => { throw new Error('CPU read benchmark must not write'); } });
    await repository.initialize();
    preparedGroups = new Map((await repository.getParkedSessionGroups()).map(group => [group.session.id, group.links]));
  },
  async run(name: string) {
    const start = performance.now();
    let count = 0;
    switch (name) {
      case 'clone': structuredClone(data); break;
      case 'schema': LinkShelfDatabaseSchema.parse(data); break;
      case 'integrity': count = getIntegrityDiagnostics(data).length; break;
      case 'compare': if (!storedValuesEqual(data, copy)) throw new Error('Comparison mismatch'); break;
      case 'stringify': count = JSON.stringify(data).length; break;
      case 'parse': JSON.parse(text); break;
      case 'hash': await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); break;
      case 'groups': count = (await repository.getParkedSessionGroups()).length; break;
      case 'groups.project': count = (await repository.getParkedSessionGroups(data.settings.defaultProjectId)).length; break;
      case 'group.serialize': count = JSON.stringify(await repository.getParkedSessionGroups()).length; break;
      case 'group.map': {
        const groups = new Map<string, SavedLink[]>();
        for (const link of data.links) {
          if (link.status !== 'parked') continue;
          const links = groups.get(link.sessionId) ?? [];
          links.push(link); groups.set(link.sessionId, links);
        }
        count = groups.size;
        break;
      }
      case 'session.list': count = data.sessions.filter(session => preparedGroups.has(session.id))
        .map(session => ({ session, links: preparedGroups.get(session.id)! })).length; break;
      case 'sort.links': [...data.links].sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0)); break;
      case 'sort.sessions': [...data.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
      case 'reminder.group': count = groupPendingReminders(data.links).length; break;
      case 'backup.validate': LinkShelfBackupSchema.parse(JSON.parse(backupText)); break;
      case 'backup.file': await readBackupFile({ size: new TextEncoder().encode(backupText).byteLength, text: async () => backupText }); break;
      default: throw new Error('Unknown CPU benchmark');
    }
    return { ms: performance.now() - start, count };
  },
};
(globalThis as typeof globalThis & { linkshelfCPU?: typeof api }).linkshelfCPU = api;
