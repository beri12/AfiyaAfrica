import { addDays, minuteOfDay, zonedDayBounds, zonedParts, zonedToUtc } from './time';

describe('time helpers', () => {
  const ADDIS = 'Africa/Addis_Ababa'; // UTC+3, no DST

  it('converts clinic-local time to UTC', () => {
    expect(zonedToUtc('2026-03-02', 9 * 60, ADDIS).toISOString()).toBe('2026-03-02T06:00:00.000Z');
  });

  it('computes zoned parts and day of week', () => {
    const p = zonedParts(new Date('2026-03-01T22:30:00Z'), ADDIS);
    expect(p).toMatchObject({ year: 2026, month: 3, day: 2, hour: 1, minute: 30, dayOfWeek: 1 });
  });

  it('computes local day bounds', () => {
    const { start, end } = zonedDayBounds('2026-03-02', ADDIS);
    expect(start.toISOString()).toBe('2026-03-01T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-02T21:00:00.000Z');
  });

  it('handles DST zones', () => {
    // 2026-03-29 Europe/Berlin switches to CEST (UTC+2) at 02:00 local.
    expect(zonedToUtc('2026-03-30', 9 * 60, 'Europe/Berlin').toISOString()).toBe('2026-03-30T07:00:00.000Z');
    expect(zonedToUtc('2026-03-27', 9 * 60, 'Europe/Berlin').toISOString()).toBe('2026-03-27T08:00:00.000Z');
  });

  it('minuteOfDay and addDays', () => {
    expect(minuteOfDay(new Date('2026-03-02T06:15:00Z'), ADDIS)).toBe(9 * 60 + 15);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
