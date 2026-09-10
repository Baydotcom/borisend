/**
 * Shared timezone utilities for trial date calculations.
 * All timestamps are stored as UTC ISO strings.
 * Timezone awareness is applied for display and reminder logic only.
 */

/**
 * Returns the user's timezone string, defaulting to UTC.
 */
export function getUserTimezone(user) {
  return user?.timezone || 'UTC';
}

/**
 * Formats a date as a YYYY-MM-DD string in the given timezone.
 */
export function formatDateInTimezone(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch (e) {
    // Fallback to UTC if invalid timezone
    return date.toISOString().split('T')[0];
  }
}

/**
 * Checks whether two dates fall on the same calendar day in the given timezone.
 */
export function isSameDayInTimezone(date1, date2, timezone) {
  return formatDateInTimezone(date1, timezone) === formatDateInTimezone(date2, timezone);
}

/**
 * Calculates trial day information in the user's timezone.
 *
 * - daysRemaining: absolute calendar days remaining (timezone-independent)
 * - hoursRemaining: absolute hours remaining
 * - isLastDay: true if trial_ends_at falls on today's date in the user's timezone
 * - isExpired: true if the trial end timestamp has passed
 */
export function getTrialDayInfo(trialEndsAt, userTimezone) {
  const now = new Date();
  const endsAt = trialEndsAt ? new Date(trialEndsAt) : null;

  if (!endsAt) {
    return { daysRemaining: 0, hoursRemaining: 0, isLastDay: false, isExpired: false };
  }

  const isExpired = now > endsAt;
  const msRemaining = Math.max(0, endsAt.getTime() - now.getTime());
  const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

  // Check if trial ends "today" in the user's timezone
  const tz = userTimezone || 'UTC';
  const isLastDay = isSameDayInTimezone(now, endsAt, tz) && hoursRemaining > 0;

  return { daysRemaining, hoursRemaining, isLastDay, isExpired };
}