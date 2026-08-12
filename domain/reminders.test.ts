import { describe, expect, it } from 'vitest';
import {
  InvalidReminderError,
  localReminderToUtc,
  toLocalDateTimeInputValue,
} from './reminders';

describe('reminder helpers', () => {
  it('returns undefined when no reminder is selected', () => {
    expect(localReminderToUtc('')).toBeUndefined();
  });

  it('converts a future local date-time into an ISO UTC string', () => {
    const value = '2099-08-10T18:30';

    expect(localReminderToUtc(value, new Date('2026-08-10T12:00:00Z'))).toBe(
      new Date(value).toISOString(),
    );
  });

  it('rejects reminders in the past', () => {
    expect(() =>
      localReminderToUtc(
        '2020-01-01T10:00',
        new Date('2026-08-10T12:00:00Z'),
      ),
    ).toThrow(InvalidReminderError);
  });

  it('formats a Date for a datetime-local input', () => {
    expect(toLocalDateTimeInputValue(new Date('2099-08-10T18:30:00Z'))).toMatch(
      /^2099-08-10T\d{2}:30$/,
    );
  });
});
