/**
 * RC16.8 — Important Date Service.
 *
 * Deterministic date calculations for important-date triggers.
 * No LLM calls, no high-frequency polling (§52).
 *
 * Uses the existing RelationshipMemory entity (extended with is_recurring_annual,
 * is_trigger_active, trigger_timing, trigger_intent) — no duplicate date store (§14).
 *
 * Portable: pure date math, no Base44 dependencies.
 * The caller (scheduler or backend function) loads RelationshipMemory records
 * and passes them to these functions.
 */

export interface ImportantDateMemory {
  id: string;
  related_date: string; // ISO date (YYYY-MM-DD)
  is_recurring_annual: boolean;
  is_trigger_active: boolean;
  trigger_timing: string; // on_date | 1_day_before | 3_days_before | 1_week_before | custom
  trigger_intent: string;
  content: string;
}

export interface UpcomingDateOccurrence {
  memory_id: string;
  original_date: string;
  next_occurrence: string; // ISO date (YYYY-MM-DD)
  trigger_date: string; // ISO date — the date the trigger should fire (before/on the occurrence)
  days_until: number;
  trigger_intent: string;
  label: string;
  is_recurring: boolean;
}

/**
 * Compute the next occurrence of an important date.
 * For annual dates: the next calendar occurrence from today.
 * For one-time dates: the date itself if still in the future, null if past.
 */
export function computeNextOccurrence(
  memory: { related_date: string; is_recurring_annual: boolean },
  now: Date = new Date()
): string | null {
  if (!memory.related_date) return null;
  const date = new Date(memory.related_date + 'T00:00:00');
  if (isNaN(date.getTime())) return null;

  if (!memory.is_recurring_annual) {
    // One-time date — only valid if in the future
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return date >= today ? memory.related_date : null;
  }

  // Annual — find next occurrence
  const today2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let year = now.getFullYear();
  // This year's occurrence
  let next = new Date(year, date.getMonth(), date.getDate());
  if (next < today2) {
    // Already passed this year — use next year
    next = new Date(year + 1, date.getMonth(), date.getDate());
  }
  return next.toISOString().split('T')[0];
}

/**
 * Compute the trigger date based on timing preference.
 * E.g. "1_week_before" → 7 days before the occurrence.
 */
export function computeTriggerDate(
  occurrenceDate: string,
  timing: string,
  now: Date = new Date()
): string | null {
  if (!occurrenceDate) return null;
  const occ = new Date(occurrenceDate + 'T00:00:00');
  if (isNaN(occ.getTime())) return null;

  switch (timing) {
    case 'on_date':
      return occurrenceDate;
    case '1_day_before':
      return new Date(occ.getTime() - 1 * 86400000).toISOString().split('T')[0];
    case '3_days_before':
      return new Date(occ.getTime() - 3 * 86400000).toISOString().split('T')[0];
    case '1_week_before':
      return new Date(occ.getTime() - 7 * 86400000).toISOString().split('T')[0];
    case 'custom':
    default:
      return occurrenceDate;
  }
}

/**
 * Get all upcoming important-date triggers for a user's PlanRecipients.
 * Returns occurrences sorted by days-until (nearest first).
 *
 * @param memories - Active RelationshipMemory records with memory_type='important_date' or 'milestone'
 * @param now - Current date
 * @param limit - Max results (dashboard list restraint, §19)
 */
export function getUpcomingDateTriggers(
  memories: ImportantDateMemory[],
  now: Date = new Date(),
  limit: number = 5
): UpcomingDateOccurrence[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const results: UpcomingDateOccurrence[] = [];

  for (const m of memories) {
    if (!m.is_trigger_active) continue; // §16: user must opt in
    if (!m.related_date) continue;

    const nextOcc = computeNextOccurrence(m, now);
    if (!nextOcc) continue; // one-time date already passed

    const triggerDate = computeTriggerDate(nextOcc, m.trigger_timing, now);
    if (!triggerDate) continue;

    const triggerDateTime = new Date(triggerDate + 'T00:00:00');
    const diffMs = triggerDateTime.getTime() - today.getTime();
    const daysUntil = Math.round(diffMs / 86400000);

    // Only include future or today triggers (past ones are handled by scheduler)
    if (daysUntil < 0) continue;

    results.push({
      memory_id: m.id,
      original_date: m.related_date,
      next_occurrence: nextOcc,
      trigger_date: triggerDate,
      days_until: daysUntil,
      trigger_intent: m.trigger_intent || '',
      label: m.content,
      is_recurring: m.is_recurring_annual,
    });
  }

  return results.sort((a, b) => a.days_until - b.days_until).slice(0, limit);
}

/**
 * Check whether an important-date trigger should fire NOW.
 * Used by the scheduler to determine if a plan with trigger_type='important_date'
 * should generate a message for this occurrence.
 *
 * Returns the trigger occurrence key (for GenerationKey dedup) if it should fire,
 * or null if it should not.
 */
export function shouldTriggerFire(
  memory: ImportantDateMemory,
  now: Date = new Date()
): string | null {
  if (!memory.is_trigger_active || !memory.related_date) return null;

  const nextOcc = computeNextOccurrence(memory, now);
  if (!nextOcc) return null;

  const triggerDate = computeTriggerDate(nextOcc, memory.trigger_timing, now);
  if (!triggerDate) return null;

  const today = now.toISOString().split('T')[0];
  if (triggerDate !== today) return null;

  // Should fire today — return the occurrence as the trigger key
  // This becomes part of the GenerationKey (trigger_occurrence)
  return nextOcc;
}