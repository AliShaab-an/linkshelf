import type { SavedLink } from '@/domain/schemas';

export const REMINDER_ALARM_PREFIX = 'linkshelf-reminder:';

export interface ReminderAlarm {
  name: string;
  scheduledTime?: number;
}

export interface ReminderAlarmApi {
  create(name: string, alarmInfo: { when: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
  getAll(): Promise<ReminderAlarm[]>;
}

export function reminderAlarmName(linkId: string): string {
  return `${REMINDER_ALARM_PREFIX}${linkId}`;
}

export function getReminderLinkId(alarmName: string): string | undefined {
  if (!alarmName.startsWith(REMINDER_ALARM_PREFIX)) {
    return undefined;
  }

  const linkId = alarmName.slice(REMINDER_ALARM_PREFIX.length);

  return linkId || undefined;
}

export function isFutureReminder(link: SavedLink, now: number): boolean {
  return (
    link.status === 'parked' &&
    link.reminderAt !== undefined &&
    !link.reminderNotifiedAt &&
    new Date(link.reminderAt).getTime() > now
  );
}

export interface ReminderGroup {
  key: string;
  reminderAt: string;
  links: SavedLink[];
}

export function groupPendingReminders(links: SavedLink[]): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup>();
  for (const link of links) {
    if (link.status !== 'parked' || !link.reminderAt || link.reminderNotifiedAt) continue;
    const key = JSON.stringify([link.sessionId, link.reminderAt]);
    let group = groups.get(key);
    if (!group) {
      group = { key, reminderAt: link.reminderAt, links: [] };
      groups.set(key, group);
    }
    group.links.push(link);
  }
  return [...groups.values()];
}

export async function reminderNotificationId(group: ReminderGroup): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(group.key));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${REMINDER_ALARM_PREFIX}notice-${hash}`;
}

export async function scheduleLinkReminder(
  link: SavedLink,
  alarms: ReminderAlarmApi,
  now: number = Date.now(),
): Promise<void> {
  const alarmName = reminderAlarmName(link.id);

  if (!isFutureReminder(link, now)) {
    await alarms.clear(alarmName);
    return;
  }

  await alarms.create(alarmName, {
    when: new Date(link.reminderAt!).getTime(),
  });
}

export async function reconcileReminderAlarms(
  links: SavedLink[],
  alarms: ReminderAlarmApi,
  now: number = Date.now(),
): Promise<void> {
  const futureLinks = groupPendingReminders(links)
    .map((group) => group.links[0])
    .filter((link) => isFutureReminder(link, now));
  const expectedAlarmNames = new Set(
    futureLinks.map((link) => reminderAlarmName(link.id)),
  );
  const existingAlarms = await alarms.getAll();
  const existingByName = new Map(existingAlarms.map((alarm) => [alarm.name, alarm]));

  const cleared = await Promise.allSettled(
    existingAlarms
      .filter(
        (alarm) =>
          alarm.name.startsWith(REMINDER_ALARM_PREFIX) &&
          !expectedAlarmNames.has(alarm.name),
      )
      .map((alarm) => alarms.clear(alarm.name)),
  );

  const created = await Promise.allSettled(
    futureLinks.filter((link) => existingByName.get(reminderAlarmName(link.id))?.scheduledTime !== new Date(link.reminderAt!).getTime()).map((link) =>
      alarms.create(reminderAlarmName(link.id), {
        when: new Date(link.reminderAt!).getTime(),
      }),
    ),
  );
  const failures = [...cleared, ...created].filter((result) => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Some reminder alarms could not be reconciled.');
}
