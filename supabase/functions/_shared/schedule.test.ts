import { describe, expect, it } from 'vitest';
import { formatMoscowDateKey, hourReminderBounds, isDailyDigestWindow, moscowDayBounds, overdueBounds } from './schedule.ts';

describe('server notification schedule', () => {
  it('recognizes the 09:00 Moscow digest window', () => {
    expect(isDailyDigestWindow(new Date('2026-11-17T06:05:00Z'))).toBe(true);
    expect(isDailyDigestWindow(new Date('2026-11-17T06:10:00Z'))).toBe(false);
  });

  it('uses the Moscow calendar date near UTC midnight', () => {
    expect(formatMoscowDateKey(new Date('2026-11-16T22:30:00Z'))).toBe('2026-11-17');
    expect(moscowDayBounds(new Date('2026-11-16T22:30:00Z'))).toEqual({
      start: '2026-11-16T21:00:00.000Z',
      end: '2026-11-17T20:59:59.999Z',
    });
  });

  it('creates non-overlapping reminder thresholds', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    expect(hourReminderBounds(now).start.toISOString()).toBe('2026-11-17T10:55:00.000Z');
    expect(hourReminderBounds(now).end.toISOString()).toBe('2026-11-17T11:05:00.000Z');
    expect(overdueBounds(now).end.toISOString()).toBe('2026-11-17T09:50:00.000Z');
  });
});
