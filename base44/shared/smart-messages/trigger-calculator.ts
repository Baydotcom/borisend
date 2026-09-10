/**
 * RC18.1 — Smart Message Trigger Calculator.
 *
 * Computes the next deterministic trigger occurrence for time-based Smart
 * Message triggers. Location and manual_event triggers are non-deterministic
 * and return null (they fire on external events, not on a schedule).
 *
 * Provider-neutral — no Base44 dependencies.
 */

/**
 * Calculate the next trigger occurrence for a Smart Message.
 * Returns an ISO string or null if the trigger is non-deterministic or expired.
 */
export function calculateNextTrigger(
  triggerType: string,
  triggerConfig: any,
  timezone?: string | null,
  now: Date = new Date(),
): string | null {
  const cfg = triggerConfig || {};
  const tz = timezone || undefined;

  switch (triggerType) {
    case 'time':
      return nextTimeOccurrence(cfg.time_of_day, cfg.recurring_days, now);
    case 'date':
      return nextDateOccurrence(cfg.specific_date, cfg.time_of_day, now);
    case 'recurring_date':
      return nextRecurringDateOccurrence(cfg, now);
    case 'manual_event':
      return null; // Non-deterministic — fires on user action
    case 'location_arrival':
    case 'location_departure':
      return null; // Non-deterministic — fires on geofence event
    default:
      return null;
  }
}

/**
 * Time trigger: fires at time_of_day on selected weekdays.
 * recurring_days: array of 0-6 (0=Sun). Empty = every day.
 */
function nextTimeOccurrence(timeOfDay: string | undefined, recurringDays: number[] | undefined, now: Date): string | null {
  if (!timeOfDay) return null;
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;

  const days = recurringDays && recurringDays.length > 0 ? recurringDays : [0, 1, 2, 3, 4, 5, 6];

  // Try today first, then up to 7 days ahead
  for (let offset = 0; offset < 8; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    const dayOfWeek = candidate.getDay();
    if (!days.includes(dayOfWeek)) continue;
    if (candidate > now) return candidate.toISOString();
  }
  return null;
}

/**
 * Date trigger: fires once on a specific date at time_of_day.
 * Returns null if the date has already passed.
 */
function nextDateOccurrence(specificDate: string | undefined, timeOfDay: string | undefined, now: Date): string | null {
  if (!specificDate) return null;
  const [year, month, day] = specificDate.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const [hours, minutes] = (timeOfDay || '09:00').split(':').map(Number);
  const candidate = new Date(year, month - 1, day, isNaN(hours) ? 9 : hours, isNaN(minutes) ? 0 : minutes, 0, 0);

  if (candidate <= now) return null; // Date has passed — one-time trigger
  return candidate.toISOString();
}

/**
 * Recurring date trigger: fires on a recurring pattern.
 * - weekly: selected weekdays at time_of_day
 * - monthly: specific day of month at time_of_day
 * - annual: specific month+day at time_of_day
 */
function nextRecurringDateOccurrence(cfg: any, now: Date): string | null {
  const pattern = cfg.recurring_pattern || 'weekly';
  const timeOfDay = cfg.time_of_day || '09:00';
  const [hours, minutes] = timeOfDay.split(':').map(Number);

  switch (pattern) {
    case 'weekly':
      return nextTimeOccurrence(timeOfDay, cfg.recurring_days, now);

    case 'monthly': {
      const dayOfMonth = cfg.recurring_day_of_month || 1;
      return nextMonthlyOccurrence(dayOfMonth, hours, minutes, now);
    }

    case 'annual': {
      const month = cfg.recurring_month || 1;
      const dayOfMonth = cfg.recurring_day_of_month || 1;
      return nextAnnualOccurrence(month, dayOfMonth, hours, minutes, now);
    }

    default:
      return null;
  }
}

function nextMonthlyOccurrence(dayOfMonth: number, hours: number, minutes: number, now: Date): string | null {
  for (let monthOffset = 0; monthOffset < 13; monthOffset++) {
    const candidate = new Date(now);
    candidate.setMonth(candidate.getMonth() + monthOffset);
    const daysInMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    const actualDay = Math.min(dayOfMonth, daysInMonth);
    candidate.setDate(actualDay);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate > now) return candidate.toISOString();
  }
  return null;
}

function nextAnnualOccurrence(month: number, dayOfMonth: number, hours: number, minutes: number, now: Date): string | null {
  for (let yearOffset = 0; yearOffset < 2; yearOffset++) {
    const candidate = new Date(now);
    candidate.setFullYear(candidate.getFullYear() + yearOffset);
    candidate.setMonth(month - 1);
    const daysInMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    candidate.setDate(Math.min(dayOfMonth, daysInMonth));
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate > now) return candidate.toISOString();
  }
  return null;
}

/**
 * Generate the deterministic execution key for idempotency (§32).
 * One occurrence to one recipient = maximum one chargeable execution.
 */
export function generateExecutionKey(
  ownerUserId: string,
  smartMessageId: string,
  contactId: string,
  triggerOccurrence: string,
): string {
  return `${ownerUserId}|${smartMessageId}|${contactId}|${triggerOccurrence}`;
}