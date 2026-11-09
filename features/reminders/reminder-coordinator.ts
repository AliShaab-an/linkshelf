import type { LinkShelfDatabase } from '@/domain/schemas';
import { groupPendingReminders, reconcileReminderAlarms, reminderNotificationId, type ReminderAlarmApi } from './reminder-service';

interface ReminderCoordinatorDependencies {
  getDatabase(): Promise<LinkShelfDatabase>;
  markNotified(linkIds: string[], reminderAt: string): Promise<unknown>;
  alarms: ReminderAlarmApi;
  getPermission(): Promise<string>;
  getNotifications(): Promise<Record<string, unknown>>;
  createNotification(id: string, options: { title: string; message: string; contextMessage: string }): Promise<unknown>;
  now?: () => number;
}

export function createReminderCoordinator(dependencies: ReminderCoordinatorDependencies) {
  let queue = Promise.resolve();
  const now = dependencies.now ?? Date.now;

  async function reconcile() {
    const failures: unknown[] = [];
    let database = await dependencies.getDatabase();
    try {
      await reconcileReminderAlarms(database.links, dependencies.alarms, now());
    } catch (error) {
      failures.push(error);
    }
    const due = groupPendingReminders(database.links).filter((group) => Date.parse(group.reminderAt) <= now());
    if (database.settings.notificationsEnabled && due.length) {
      try {
        const permission = await dependencies.getPermission();
        if (permission !== 'granted') throw new Error('Chrome notifications are disabled. Due reminders remain in Today.');
        const active = await dependencies.getNotifications();
        // Permission checks may yield while links move or leave the parked state.
        database = await dependencies.getDatabase();
        const currentDue = groupPendingReminders(database.links).filter((group) => Date.parse(group.reminderAt) <= now());
        let groups = new Map(currentDue.map((group) => [group.key, group]));
        let projects = new Map(database.projects.map((project) => [project.id, project]));
        for (const candidate of currentDue) {
          const latest = await dependencies.getDatabase();
          if (latest !== database) {
            database = latest;
            groups = new Map(groupPendingReminders(database.links).map((group) => [group.key, group]));
            projects = new Map(database.projects.map((project) => [project.id, project]));
          }
          if (!database.settings.notificationsEnabled) break;
          const group = groups.get(candidate.key);
          if (!group) continue;
          try {
            const representative = group.links[0];
            const project = projects.get(representative.projectId);
            const id = await reminderNotificationId(group);
            if (!Object.hasOwn(active, id)) {
              await dependencies.createNotification(id, {
                title: group.links.length === 1 ? 'LinkShelf reminder' : `LinkShelf reminder: ${project?.name ?? 'Parked tabs'}`,
                message: (representative.note || (group.links.length === 1 ? representative.title : `${group.links.length} parked tabs are ready to review.`)).slice(0, 250),
                contextMessage: group.links.length === 1 ? representative.domain : `${group.links.length} links`,
              });
            }
            await dependencies.markNotified(group.links.map((link) => link.id), group.reminderAt);
          } catch (error) {
            failures.push(error);
          }
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Reminder reconciliation could not complete. Pending reminders remain available in Today.');
  }

  return {
    reconcile(): Promise<void> {
      const result = queue.then(reconcile);
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
