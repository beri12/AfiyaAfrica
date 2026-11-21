/**
 * Timezone helpers built on Intl (no external tz database needed; Node ships full ICU).
 * All persisted timestamps are UTC; clinic-local time is used for availability and display.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0 = Sunday
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayOfWeek: WEEKDAYS.indexOf(parts.weekday ?? ''),
  };
}

/** Offset (ms) of `tz` from UTC at instant `date`. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** Converts a clinic-local calendar date (YYYY-MM-DD) + minute-of-day into a UTC Date. */
export function zonedToUtc(isoDate: string, minuteOfDay: number, tz: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  let result = guess - tzOffsetMs(new Date(guess), tz);
  // Second pass handles instants near DST transitions.
  result = guess - tzOffsetMs(new Date(result), tz);
  return new Date(result);
}

/** Clinic-local YYYY-MM-DD for an instant. */
export function zonedDateString(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC bounds of a clinic-local calendar day. */
export function zonedDayBounds(isoDate: string, tz: string): { start: Date; end: Date } {
  const start = zonedToUtc(isoDate, 0, tz);
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = zonedToUtc(next.toISOString().slice(0, 10), 0, tz);
  return { start, end };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function minuteOfDay(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}
