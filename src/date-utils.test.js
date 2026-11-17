import { describe, expect, it } from 'vitest';
import { addDays, addMonths, calendarDays, dateKey, startOfMonth, startOfWeek, weekDays, weekTitle } from './date-utils.js';

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

  it('builds a Monday-first week', () => {
    const days = weekDays(new Date(2026, 10, 19));
    expect(days.map(dateKey)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(dateKey(startOfWeek(new Date(2026, 10, 22)))).toBe('2026-11-16');
    expect(dateKey(addDays(days[6], 1))).toBe('2026-11-23');
    expect(weekTitle(new Date(2026, 10, 19))).toContain('22 нояб. 2026');
  });
});
