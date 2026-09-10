/**
 * Outcome Signal Service — Deterministic message outcome classification
 * and preference signal extraction (RC16.5 / RC16.6 CORRECTED).
 *
 * Learns from message outcomes (skip, edit, alternative request, approve, send)
 * to influence future generation WITHOUT additional LLM calls.
 *
 * Design principles:
 * - Deterministic (no AI analysis — pure logic from existing status/feedback fields)
 * - Recipient-scoped (PlanRecipient-level, not global — one relationship's
 *   skip preferences do not leak to another)
 * - Restrained (requires repeated patterns, not single actions — minimum 3
 *   data points before any signal activates)
 * - Non-overfitting (thresholds prevent one rejection from redefining preferences)
 *
 * RC16.6 CORRECTION:
 * - Technical failures (status=failed) are now TECHNICAL_FAILED, NOT DELETED_UNUSED.
 * - System cancellations (status=cancelled, plan archived) are now SYSTEM_CANCELLED.
 * - Approved messages are APPROVED (not APPROVED_USED — we don't know if sent).
 * - Sent messages are distinct from approved.
 * - Only genuine user behaviour influences preference learning.
 * - System/technical outcomes generate ZERO preference signals.
 *
 * Commercial Message Unit rules are NOT affected:
 * - A skipped/deleted/failed message still consumed 1 Message Unit (RC16.1 §48).
 * - This service only influences FUTURE generation style, not billing.
 */

export type MessageOutcome =
  | 'APPROVED'
  | 'EDITED_AND_APPROVED'
  | 'SENT'
  | 'EDITED_AND_SENT'
  | 'USER_SKIPPED'
  | 'USER_DELETED_UNUSED'
  | 'ALTERNATIVE_REQUESTED'
  | 'SYSTEM_CANCELLED'
  | 'TECHNICAL_FAILED';

/** Outcomes that represent genuine user behaviour (eligible for preference learning). */
const USER_BEHAVIOUR_OUTCOMES: ReadonlySet<MessageOutcome> = new Set([
  'APPROVED',
  'EDITED_AND_APPROVED',
  'SENT',
  'EDITED_AND_SENT',
  'USER_SKIPPED',
  'USER_DELETED_UNUSED',
  'ALTERNATIVE_REQUESTED',
]);

/** Outcomes caused by the system, NOT user preference (zero preference signal). */
const SYSTEM_OUTCOMES: ReadonlySet<MessageOutcome> = new Set([
  'SYSTEM_CANCELLED',
  'TECHNICAL_FAILED',
]);

export interface OutcomeSummary {
  total: number;
  outcomes: Record<MessageOutcome, number>;
  signals: string[];
}

function isEdited(message: any): boolean {
  return !!(message.edited_content && message.edited_content.trim() !== (message.content || '').trim());
}

/**
 * Classify a single message's outcome from its status, edited_content,
 * version metadata, resolution_reason, and associated feedback.
 *
 * RC16.6: Uses resolution_reason when available to distinguish user-deleted
 * from system-cancelled. When resolution_reason is missing (legacy messages),
 * infers from status: cancelled→SYSTEM_CANCELLED, failed→TECHNICAL_FAILED.
 */
export function classifyMessageOutcome(message: any, feedback?: any): MessageOutcome {
  // SENT — the message was actually delivered through the tracked send flow
  if (message.status === 'sent') {
    return isEdited(message) ? 'EDITED_AND_SENT' : 'SENT';
  }

  // SKIPPED — user chose not to use this prepared communication
  if (message.status === 'skipped') return 'USER_SKIPPED';

  // CANCELLED — terminal state. Distinguish user-deleted from system-cancelled.
  if (message.status === 'cancelled') {
    // RC16.6: Use resolution_reason when available
    if (message.resolution_reason === 'user_deleted') return 'USER_DELETED_UNUSED';
    // Default: cancelled = plan archived (system action, per RC16.2 schema)
    return 'SYSTEM_CANCELLED';
  }

  // FAILED — technical failure (generation or send failure, NOT user choice)
  if (message.status === 'failed') {
    return 'TECHNICAL_FAILED';
  }

  // Alternative requested via explicit feedback
  if (feedback?.rating === 'prepare_another') return 'ALTERNATIVE_REQUESTED';

  // Alternative/improvement version that was selected by the user
  if (message.is_selected && (message.version_type === 'alternative' || message.version_type === 'improvement')) {
    return 'EDITED_AND_SENT';
  }

  // Approved — user accepted the prepared message (but it hasn't been sent yet)
  if (message.status === 'approved') {
    return isEdited(message) ? 'EDITED_AND_APPROVED' : 'APPROVED';
  }

  // Pending/draft — no outcome yet; do not classify (caller should exclude)
  return 'APPROVED';
}

/**
 * Build compact deterministic preference signals from recent message outcomes
 * for a specific PlanRecipient.
 *
 * RC16.6: SYSTEM_CANCELLED and TECHNICAL_FAILED outcomes are EXCLUDED from
 * signal calculation — they do not represent user preference.
 *
 * Signals are only generated when there are enough data points to indicate
 * a repeated pattern (minimum 3 user-behaviour messages, with at least 2
 * showing the pattern). This prevents overfitting from a single skip or edit.
 */
export function buildOutcomeSignals(
  messages: any[],
  feedbacks: any[]
): OutcomeSummary {
  const outcomes: Record<MessageOutcome, number> = {
    APPROVED: 0,
    EDITED_AND_APPROVED: 0,
    SENT: 0,
    EDITED_AND_SENT: 0,
    USER_SKIPPED: 0,
    USER_DELETED_UNUSED: 0,
    ALTERNATIVE_REQUESTED: 0,
    SYSTEM_CANCELLED: 0,
    TECHNICAL_FAILED: 0,
  };

  // Build feedback lookup by message_id
  const feedbackMap = new Map<string, any>();
  for (const fb of feedbacks) {
    if (fb.message_id) {
      feedbackMap.set(fb.message_id, fb);
    }
  }

  // Classify each message
  for (const msg of messages) {
    const outcome = classifyMessageOutcome(msg, feedbackMap.get(msg.id));
    outcomes[outcome]++;
  }

  // RC16.6: Only user-behaviour outcomes count toward preference learning.
  // System/technical outcomes are tracked for observability but do NOT
  // generate preference signals.
  const userBehaviourTotal = (Object.keys(outcomes) as MessageOutcome[])
    .filter(o => USER_BEHAVIOUR_OUTCOMES.has(o))
    .reduce((sum, o) => sum + outcomes[o], 0);

  const total = messages.length;
  const signals: string[] = [];

  // Restraint: minimum 3 user-behaviour data points before any signal activates
  const MIN_TOTAL = 3;

  if (userBehaviourTotal < MIN_TOTAL) {
    return { total, outcomes, signals };
  }

  const skipRate = outcomes.USER_SKIPPED / userBehaviourTotal;
  const deleteRate = outcomes.USER_DELETED_UNUSED / userBehaviourTotal;
  const editRate = (outcomes.EDITED_AND_APPROVED + outcomes.EDITED_AND_SENT) / userBehaviourTotal;
  const altRate = outcomes.ALTERNATIVE_REQUESTED / userBehaviourTotal;
  const positiveRate = (outcomes.APPROVED + outcomes.EDITED_AND_APPROVED + outcomes.SENT + outcomes.EDITED_AND_SENT) / userBehaviourTotal;

  // Skip signals — user frequently skips prepared messages
  if (skipRate >= 0.4 && outcomes.USER_SKIPPED >= 2) {
    signals.push('User frequently skips prepared messages — prefer shorter, more direct content');
  }

  // Edit signals — user often edits messages before sending/approving
  if (editRate >= 0.3 && (outcomes.EDITED_AND_APPROVED + outcomes.EDITED_AND_SENT) >= 2) {
    signals.push('User often edits messages before sending — prefer concise, easily adaptable wording');
  }

  // Alternative request signals — user frequently requests alternatives
  if (altRate >= 0.3 && outcomes.ALTERNATIVE_REQUESTED >= 2) {
    signals.push('User frequently requests alternatives — avoid repetitive or generic themes');
  }

  // Positive signal — user generally approves/sends messages (preserve current approach)
  if (positiveRate >= 0.7 && userBehaviourTotal >= 4) {
    signals.push('User generally approves messages — current tone and approach are working well');
  }

  // Note: USER_DELETED_UNUSED is a weak negative signal but we don't generate
  // a dedicated signal for it unless it becomes a dominant pattern (>50%).
  if (deleteRate >= 0.5 && outcomes.USER_DELETED_UNUSED >= 3) {
    signals.push('User frequently deletes prepared messages without using them — review content relevance');
  }

  return { total, outcomes, signals };
}