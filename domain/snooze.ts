export type SnoozePresetId = 'hour' | 'tomorrow' | 'next-week';

export interface SnoozePreset {
  id: SnoozePresetId;
  label: string;
  at: Date;
}

const MORNING_HOUR = 9;

/** Quick "remind me again" choices in the user's local time. */
export function snoozePresets(now: Date = new Date()): SnoozePreset[] {
  const hour = new Date(now.getTime() + 60 * 60 * 1000);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, MORNING_HOUR, 0, 0, 0);
  // Next Monday strictly after today; on a Monday that is seven days away.
  const untilMonday = (8 - now.getDay()) % 7 || 7;
  const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + untilMonday, MORNING_HOUR, 0, 0, 0);
  const presets: SnoozePreset[] = [
    { id: 'hour', label: 'In 1 hour', at: hour },
    { id: 'tomorrow', label: 'Tomorrow morning', at: tomorrow },
  ];
  // When tomorrow is already Monday, a separate "next week" choice would be a duplicate.
  if (nextWeek.getTime() !== tomorrow.getTime()) presets.push({ id: 'next-week', label: 'Next week', at: nextWeek });
  return presets;
}
