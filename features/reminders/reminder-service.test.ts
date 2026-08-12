import { describe, expect, it, vi } from 'vitest';
import type { SavedLink } from '@/domain/schemas';
import {
  getReminderLinkId,
  reconcileReminderAlarms,
  reminderAlarmName,
  scheduleLinkReminder,
} from './reminder-service';

function createLink(overrides: Partial<SavedLink> = {}): SavedLink {
  return {
    id: 'link-1',
    sessionId: 'session-1',
    projectId: 'inbox',
    title: 'Example',
    url: 'https://example.com',
    normalizedUrl: 'https://example.com',
    domain: 'example.com',
    status: 'parked',
    pinnedBeforeParking: false,
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('reminder service', () => {
  it('creates stable alarm names and ignores unrelated alarms', () => {
    expect(reminderAlarmName('link-1')).toBe('linkshelf-reminder:link-1');
    expect(getReminderLinkId('linkshelf-reminder:link-1')).toBe('link-1');
    expect(getReminderLinkId('another-extension')).toBeUndefined();
  });

  it('schedules a future reminder at its exact timestamp', async () => {
    const alarms = {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue([]),
    };
    const link = createLink({ reminderAt: '2026-08-11T09:30:00.000Z' });

    await scheduleLinkReminder(
      link,
      alarms,
      new Date('2026-08-10T10:00:00.000Z').getTime(),
    );

    expect(alarms.create).toHaveBeenCalledWith(reminderAlarmName(link.id), {
      when: new Date(link.reminderAt!).getTime(),
    });
  });

  it('clears an alarm when the link is no longer eligible', async () => {
    const alarms = {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue([]),
    };

    await scheduleLinkReminder(createLink(), alarms);

    expect(alarms.clear).toHaveBeenCalledWith('linkshelf-reminder:link-1');
    expect(alarms.create).not.toHaveBeenCalled();
  });

  it('rebuilds future alarms and removes stale LinkShelf alarms', async () => {
    const alarms = {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue([
        { name: 'linkshelf-reminder:stale-link' },
        { name: 'unrelated-alarm' },
      ]),
    };
    const future = createLink({ reminderAt: '2026-08-12T10:00:00.000Z' });

    await reconcileReminderAlarms(
      [
        future,
        createLink({
          id: 'same-session-link',
          reminderAt: '2026-08-12T10:00:00.000Z',
        }),
        createLink({ id: 'without-reminder' }),
      ],
      alarms,
      new Date('2026-08-10T10:00:00.000Z').getTime(),
    );

    expect(alarms.clear).toHaveBeenCalledWith(
      'linkshelf-reminder:stale-link',
    );
    expect(alarms.clear).not.toHaveBeenCalledWith('unrelated-alarm');
    expect(alarms.create).toHaveBeenCalledWith(
      reminderAlarmName(future.id),
      { when: new Date(future.reminderAt!).getTime() },
    );
    expect(alarms.create).toHaveBeenCalledTimes(1);
  });
});
