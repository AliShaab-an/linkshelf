import { describe, expect, it } from 'vitest';
import { snoozePresets } from './snooze';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('snoozePresets', () => {
  it('offers one hour, tomorrow at 9:00 and next Monday at 9:00', () => {
    const presets = snoozePresets(local(2026, 11, 19, 14, 30)); // Thursday
    expect(presets.map((preset) => preset.id)).toEqual(['hour', 'tomorrow', 'next-week']);
    expect(presets[0].at).toEqual(local(2026, 11, 19, 15, 30));
    expect(presets[1].at).toEqual(local(2026, 11, 20, 9, 0));
    expect(presets[2].at).toEqual(local(2026, 11, 23, 9, 0));
  });

  it('uses the following Monday when today is Monday', () => {
    expect(snoozePresets(local(2026, 11, 23, 8, 0))[2].at).toEqual(local(2026, 11, 30, 9, 0));
  });

  it('drops next week when it would equal tomorrow', () => {
    const presets = snoozePresets(local(2026, 11, 22, 10, 0)); // Sunday
    expect(presets.map((preset) => preset.id)).toEqual(['hour', 'tomorrow']);
  });

  it('crosses month and year boundaries', () => {
    expect(snoozePresets(local(2026, 12, 31, 23, 30)).map((preset) => preset.at)).toEqual([
      local(2027, 1, 1, 0, 30), local(2027, 1, 1, 9, 0), local(2027, 1, 4, 9, 0),
    ]);
  });
});
