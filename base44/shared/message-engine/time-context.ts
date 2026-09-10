/**
 * TimeContextService — Computes delivery time context from scheduled UTC + timezone.
 * Portable: uses only standard Intl APIs, no Base44 dependencies.
 */

import { DeliveryTimeContext, Daypart } from './types.ts';

/**
 * Daypart definitions:
 *   Morning:   05:00–11:59
 *   Afternoon: 12:00–16:59
 *   Evening:   17:00–21:59
 *   Night:     22:00–04:59
 */
export function getDaypart(localHour: number): Daypart {
  if (localHour >= 5 && localHour < 12) return 'morning';
  if (localHour >= 12 && localHour < 17) return 'afternoon';
  if (localHour >= 17 && localHour < 22) return 'evening';
  return 'night';
}

export function getAllowedGreetings(daypart: Daypart): string[] {
  switch (daypart) {
    case 'morning': return ['Good morning', 'Morning', 'Rise and shine'];
    case 'afternoon': return ['Good afternoon', 'Afternoon', 'Hope your day is going well'];
    case 'evening': return ['Good evening', 'Evening', 'Hope you had a good day'];
    case 'night': return ['Good night', 'Sleep well', 'Sweet dreams', 'Rest well'];
  }
}

export function getProhibitedGreetings(daypart: Daypart): string[] {
  const all = {
    morning: ['good afternoon', 'good evening', 'good night', 'sleep well', 'tonight', 'this evening'],
    afternoon: ['good morning', 'this morning', 'start your day', 'good evening', 'good night', 'sleep well', 'tonight'],
    evening: ['good morning', 'this morning', 'start your day', 'good afternoon', 'good night', 'sleep well'],
    night: ['good morning', 'this morning', 'start your day', 'good afternoon', 'good evening', 'this evening'],
  };
  return all[daypart];
}

export function buildTimeContext(
  scheduledUtc: string,
  timezone: string,
  scheduleType: string
): DeliveryTimeContext {
  const date = new Date(scheduledUtc);
  const tz = timezone || 'UTC';

  try {
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
    const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
    });

    const parts = timeFormatter.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '';

    let hour = parseInt(get('hour'), 10);
    if (hour === 24) hour = 0;
    const minute = get('minute');
    const year = get('year');
    const month = get('month');
    const day = get('day');

    const local_date = `${year}-${month}-${day}`;
    const local_time = `${String(hour).padStart(2, '0')}:${minute}`;
    const weekday = weekdayFormatter.format(date);

    // Build ISO local string with timezone offset
    const offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const offsetParts = offsetFormatter.formatToParts(date);
    const offset = offsetParts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
    const offsetNormalized = offset.replace('GMT', '').replace('UTC', '') || '+00:00';
    const scheduled_local = `${local_date}T${local_time}:00${offsetNormalized}`;

    const daypart = getDaypart(hour);

    return {
      timezone: tz,
      scheduled_utc: scheduledUtc,
      scheduled_local,
      local_date,
      local_time,
      local_hour: hour,
      weekday,
      daypart,
      schedule_type: scheduleType,
    };
  } catch {
    // Fallback to UTC if timezone invalid
    const hour = date.getUTCHours();
    const local_date = date.toISOString().split('T')[0];
    const local_time = `${String(hour).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
    return {
      timezone: 'UTC',
      scheduled_utc: scheduledUtc,
      scheduled_local: `${local_date}T${local_time}:00+00:00`,
      local_date,
      local_time,
      local_hour: hour,
      weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date),
      daypart: getDaypart(hour),
      schedule_type: scheduleType,
    };
  }
}