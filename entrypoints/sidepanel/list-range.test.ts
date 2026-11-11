import { describe, expect, it } from 'vitest';
import { listRange } from './list-range';

describe('sidebar list ranges', () => {
  it('uses one empty or partial first range for small collections', () => {
    expect(listRange(0, 0)).toEqual({ page: 0, pages: 1, start: 0, end: 0 });
    expect(listRange(9, 0)).toEqual({ page: 0, pages: 1, start: 0, end: 9 });
  });

  it('exposes all records in order with at most 25 in each mounted range', () => {
    const values = Array.from({ length: 1962 }, (_, i) => i);
    const first = listRange(values.length, 0);
    const visible = Array.from({ length: first.pages }, (_, page) => {
      const { start, end } = listRange(values.length, page);
      expect(end - start).toBeLessThanOrEqual(25);
      return values.slice(start, end);
    });
    expect(visible.flat()).toEqual(values);
  });

  it('clamps a removed last page and preserves the selected range while items remain', () => {
    expect(listRange(51, 2).start).toBe(50);
    expect(listRange(50, 2)).toEqual({ page: 1, pages: 2, start: 25, end: 50 });
    expect(listRange(50, -1).page).toBe(0);
  });
});
