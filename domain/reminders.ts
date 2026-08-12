export class InvalidReminderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReminderError';
  }
}

export function localReminderToUtc(
  localDateTime: string,
  now: Date = new Date(),
): string | undefined {
  if (!localDateTime) {
    return undefined;
  }

  const reminder = new Date(localDateTime);

  if (Number.isNaN(reminder.getTime())) {
    throw new InvalidReminderError('Choose a valid reminder date and time.');
  }

  if (reminder.getTime() <= now.getTime()) {
    throw new InvalidReminderError('Reminder must be in the future.');
  }

  return reminder.toISOString();
}

export function toLocalDateTimeInputValue(date: Date): string {
  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );

  return localTime.toISOString().slice(0, 16);
}
