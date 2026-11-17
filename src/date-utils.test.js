import { describe, expect, it } from 'vitest';
import { addMonths, calendarDays, dateKey, startOfMonth } from './date-utils.js';

describe('calendar date helpers', () => {
  it('builds a six-week Monday-first grid', () => {
    const days = calendarDays(new Date(2026, 10, 1));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1);
    expect(days[41].getDay()).toBe(0);
  });

  it('handles year boundaries', () => {
    expect(dateKey(addMonths(new Date(2026, 11, 1), 1))).toBe('2027-01-01');
    expect(dateKey(startOfMonth(new Date(2026, 6, 22)))).toBe('2026-07-01');
  });
});
