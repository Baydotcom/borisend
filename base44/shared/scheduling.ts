/**
 * Scheduling utilities for daily random-time communication plans.
 * All timestamps are stored as UTC ISO strings.
 * Random times are selected within a permitted daily sending window (08:00–21:00 local).
 */

export const SENDING_WINDOW_START_HOUR = 8;
export const SENDING_WINDOW_END_HOUR = 21;

/**
 * Converts a wall-clock time in a specific IANA timezone to a UTC Date.
 * Uses Intl.DateTimeFormat to compute the timezone offset at the given date
 * (handles DST correctly for the target instant).
 */
export function zonedTimeToUtc(
  timezone: string,
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute: number,
  second: number = 0
): Date {
  const tz = timezone || 'UTC';

  // Create a UTC timestamp as if the local time were UTC
  const asIfUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  // Compute the timezone offset at this instant by comparing formatted parts
  const utcParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(asIfUtc);
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(asIfUtc);

  const get = (parts: any[], type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  const toMs = (parts: any[]) => {
    let h = get(parts, 'hour');
    if (h === 24) h = 0;
    return Date.UTC(get(parts, 'year'), get(parts, 'month') - 1, get(parts, 'day'), h, get(parts, 'minute'), get(parts, 'second') || 0);
  };

  // offset = tz time - utc time (positive = ahead of UTC)
  const offsetMs = toMs(tzParts) - toMs(utcParts);

  // UTC = local_as_utc - offset
  return new Date(asIfUtc.getTime() - offsetMs);
}

/**
 * Computes the next random daily scheduled time within the sending window.
 * Returns a UTC ISO string for the next occurrence.
 *
 * Algorithm:
 *   1. Get the current local date in the user's timezone.
 *   2. Pick a random hour (08–20) and minute (0–59) for today.
 *   3. If today's random time has already passed, schedule for tomorrow instead.
 *
 * This guarantees the scheduled time is never in the past and always
 * falls within the permitted sending window.
 */
export function computeRandomDailyNext(
  timezone: string,
  baseDate: Date = new Date(),
  forceNextDay: boolean = false
): string {
  const tz = timezone || 'UTC';

  // Get current local date in user's timezone (YYYY-MM-DD)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = fmt.format(baseDate).split('-').map(Number);

  // If forcing next day, start from tomorrow's date
  let targetY = y, targetM = m, targetD = d;
  if (forceNextDay) {
    const tomorrow = new Date(y, m - 1, d + 1);
    targetY = tomorrow.getFullYear();
    targetM = tomorrow.getMonth() + 1;
    targetD = tomorrow.getDate();
  }

  // Pick a random time within the sending window
  const randHour = SENDING_WINDOW_START_HOUR +
    Math.floor(Math.random() * (SENDING_WINDOW_END_HOUR - SENDING_WINDOW_START_HOUR));
  const randMin = Math.floor(Math.random() * 60);
  const target = zonedTimeToUtc(tz, targetY, targetM, targetD, randHour, randMin, 0);

  // If not forcing and today's random time has already passed, schedule for tomorrow
  if (!forceNextDay && target <= baseDate) {
    const tomorrow = new Date(y, m - 1, d + 1);
    const ty = tomorrow.getFullYear();
    const tm = tomorrow.getMonth() + 1;
    const td = tomorrow.getDate();
    const newRandHour = SENDING_WINDOW_START_HOUR +
      Math.floor(Math.random() * (SENDING_WINDOW_END_HOUR - SENDING_WINDOW_START_HOUR));
    const newRandMin = Math.floor(Math.random() * 60);
    return zonedTimeToUtc(tz, ty, tm, td, newRandHour, newRandMin, 0).toISOString();
  }

  return target.toISOString();
}

/**
 * FAR_FUTURE — sentinel ISO timestamp used when a campaign has no valid
 * upcoming schedule ('custom', empty 'specific_dates', empty 'selected_weekdays').
 * Excludes the campaign from due-time queries (next_scheduled <= now).
 */
export const FAR_FUTURE = new Date('9999-01-01T00:00:00.000Z').toISOString();

function _localYMD(tz: string, base: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = fmt.format(base).split('-').map(Number);
  return { y, m, d };
}

function _nextDailyOccurrence(tz: string, base: Date, hours: number[], minute: number): string {
  const { y, m, d } = _localYMD(tz, base);
  for (const h of hours) {
    const cand = zonedTimeToUtc(tz, y, m, d, h, minute, 0);
    if (cand.getTime() > base.getTime()) return cand.toISOString();
  }
  const tomorrow = new Date(y, m - 1, d + 1);
  return zonedTimeToUtc(tz, tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate(), hours[0], minute, 0).toISOString();
}

function _nextWeekdayOccurrence(tz: string, base: Date, weekdays: number[], hour: number, minute: number): string {
  const { y, m, d } = _localYMD(tz, base);
  const cur = new Date(y, m - 1, d);
  for (let i = 0; i < 14; i++) {
    if (weekdays.includes(cur.getDay())) {
      const cand = zonedTimeToUtc(tz, cur.getFullYear(), cur.getMonth() + 1, cur.getDate(), hour, minute, 0);
      if (cand.getTime() > base.getTime()) return cand.toISOString();
    }
    cur.setDate(cur.getDate() + 1);
  }
  return FAR_FUTURE;
}

function _nextMonthDayOccurrence(tz: string, base: Date, dayOfMonth: number, hour: number, minute: number): string {
  const { y, m } = _localYMD(tz, base);
  const candThis = zonedTimeToUtc(tz, y, m, dayOfMonth, hour, minute, 0);
  if (candThis.getTime() > base.getTime()) return candThis.toISOString();
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return zonedTimeToUtc(tz, ny, nm, dayOfMonth, hour, minute, 0).toISOString();
}

function _nextSpecificDateOccurrence(tz: string, base: Date, dates: string[], hour: number, minute: number): string {
  const sorted = dates.slice().sort();
  for (const ds of sorted) {
    const [dy, dm, dd] = ds.split('-').map(Number);
    if (!dy || !dm || !dd) continue;
    const cand = zonedTimeToUtc(tz, dy, dm, dd, hour, minute, 0);
    if (cand.getTime() > base.getTime()) return cand.toISOString();
  }
  return FAR_FUTURE;
}

/**
 * Compute the next due UTC timestamp for a campaign's schedule, strictly
 * after baseDate. This is the single source of truth for `next_scheduled`.
 *
 * Used on plan creation/update/resume (forceNextDayRandom = false: a random
 * plan may still fire later today if its window hasn't passed) and after a
 * successful generation (forceNextDayRandom = true: always advance to the
 * next occurrence).
 *
 * Returns FAR_FUTURE for schedules with no upcoming occurrence so the
 * campaign is excluded from due-time queries.
 */
export function computeNextDueTime(
  campaign: { schedule_type?: string; schedule_time?: string; schedule_days?: number[]; schedule_dates?: string[] },
  timezone: string,
  baseDate: Date = new Date(),
  forceNextDayRandom = false
): string {
  const tz = timezone || 'UTC';
  const scheduleTime = campaign.schedule_time || '09:00';
  const parts = String(scheduleTime).split(':').map((n: string) => parseInt(n, 10));
  const hour = isNaN(parts[0]) ? 9 : parts[0];
  const minute = isNaN(parts[1]) ? 0 : parts[1];

  switch (campaign.schedule_type) {
    case 'random_daily':
      return computeRandomDailyNext(tz, baseDate, forceNextDayRandom);

    case 'specific_daily':
      return _nextDailyOccurrence(tz, baseDate, [hour], minute);

    case 'twice_daily':
      return _nextDailyOccurrence(tz, baseDate, [hour, (hour + 12) % 24], minute);

    case 'weekly':
      return _nextWeekdayOccurrence(tz, baseDate, [1], hour, minute);

    case 'every_friday':
      return _nextWeekdayOccurrence(tz, baseDate, [5], hour, minute);

    case 'selected_weekdays': {
      const days = (campaign.schedule_days || []).slice().sort((a, b) => a - b);
      if (days.length === 0) return FAR_FUTURE;
      return _nextWeekdayOccurrence(tz, baseDate, days, hour, minute);
    }

    case 'monthly':
      return _nextMonthDayOccurrence(tz, baseDate, 1, hour, minute);

    case 'specific_dates': {
      const dates = campaign.schedule_dates || [];
      if (dates.length === 0) return FAR_FUTURE;
      return _nextSpecificDateOccurrence(tz, baseDate, dates, hour, minute);
    }

    case 'custom':
    default:
      return FAR_FUTURE;
  }
}