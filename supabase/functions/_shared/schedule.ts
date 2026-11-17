export const MOSCOW_TIME_ZONE = 'Europe/Moscow';

export function formatMoscowDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function moscowClock(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { hour: part('hour'), minute: part('minute') };
}

export function isDailyDigestWindow(date: Date) {
  const { hour, minute } = moscowClock(date);
  return hour === 9 && minute < 10;
}

export function moscowDayBounds(date: Date) {
  const key = formatMoscowDateKey(date);
  return {
    start: new Date(`${key}T00:00:00+03:00`).toISOString(),
    end: new Date(`${key}T23:59:59.999+03:00`).toISOString(),
  };
}

export function hourReminderBounds(date: Date) {
  return {
    start: new Date(date.getTime() + 55 * 60_000),
    end: new Date(date.getTime() + 65 * 60_000),
  };
}

export function overdueBounds(date: Date) {
  return {
    start: new Date(date.getTime() - 7 * 86_400_000),
    end: new Date(date.getTime() - 10 * 60_000),
  };
}
