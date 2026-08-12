import type { SavedLink } from '@/domain/schemas';

export const REMINDER_ALARM_PREFIX = 'linkshelf-reminder:';

export interface ReminderAlarm {
  name: string;
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
    new Date(link.reminderAt).getTime() > now
  );
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
  const futureLinks = links
    .filter((link) => isFutureReminder(link, now))
    .filter(
      (link, index, allLinks) =>
        allLinks.findIndex((candidate) => candidate.sessionId === link.sessionId) ===
        index,
    );
  const expectedAlarmNames = new Set(
    futureLinks.map((link) => reminderAlarmName(link.id)),
  );
  const existingAlarms = await alarms.getAll();

  await Promise.all(
    existingAlarms
      .filter(
        (alarm) =>
          alarm.name.startsWith(REMINDER_ALARM_PREFIX) &&
          !expectedAlarmNames.has(alarm.name),
      )
      .map((alarm) => alarms.clear(alarm.name)),
  );

  await Promise.all(
    futureLinks.map((link) =>
      alarms.create(reminderAlarmName(link.id), {
        when: new Date(link.reminderAt!).getTime(),
      }),
    ),
  );
}
