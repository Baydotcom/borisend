/**
 * Safety & Boundary Engine — Deterministic pre-generation safety layer (§14, §15, §16).
 * Provider-neutral and portable.
 *
 * The engine does NOT turn BoriSend into professional counselling. It identifies
 * when ordinary relationship-building/reconnection support is inappropriate and
 * returns a structured outcome so the pipeline can block or flag for review.
 *
 * Inputs: explicit structured boundary flags (future-ready) + boundary-type
 * memory content + relationship state/goal. Deterministic keyword detection on
 * boundary memories is used because there is no structured flag UI yet (RC14).
 */

import type { IntelligenceInput, SafetyOutcome, SafetyStatus, MemoryItem } from './types.ts';

// Phrases in boundary memories that indicate contact should not be encouraged.
const NO_CONTACT_PHRASES = [
  'no contact', 'do not contact', "don't contact", 'stop contacting',
  'asked for space', 'needs space', 'requested no contact', 'do not reach out',
  'restraining order', 'cease all contact', 'leave me alone', 'wants no contact',
  'no longer in contact', 'blocked', 'asked to stop',
];

const SAFETY_RISK_PHRASES = [
  'safety concern', 'safeguarding', 'at risk', 'vulnerable adult',
  'domestic abuse', 'domestic violence', 'coercive control', 'harassment',
  'stalking', 'exploitation', 'grooming',
];

/**
 * Extract structured boundary signals from boundary-type memories.
 */
export function extractBoundaryFlags(memories: MemoryItem[]): string[] {
  const flags: string[] = [];
  const boundaryMemories = memories.filter(m => m.memory_type === 'boundary' && m.is_active);
  for (const m of boundaryMemories) {
    const lower = (m.content || '').toLowerCase();
    if (NO_CONTACT_PHRASES.some(p => lower.includes(p))) flags.push('no_contact_requested');
    if (SAFETY_RISK_PHRASES.some(p => lower.includes(p))) flags.push('safety_risk');
  }
  return flags;
}

export function evaluateSafety(input: IntelligenceInput): SafetyOutcome {
  const flags = [...(input.explicit_boundary_flags || [])];
  const boundaryMemories = input.memories.filter(m => m.memory_type === 'boundary' && m.is_active);
  const memoryFlags = extractBoundaryFlags(input.memories);
  flags.push(...memoryFlags);
  const allFlags = [...new Set(flags)];

  // ── Hard block: do not encourage contact ──
  if (allFlags.includes('no_contact_requested') || allFlags.includes('legal_restriction') || allFlags.includes('stalking') || allFlags.includes('coercive') || allFlags.includes('abusive_situation') || allFlags.includes('exploitation') || allFlags.includes('safety_risk')) {
    return {
      status: 'DO_NOT_ENCOURAGE_CONTACT',
      reason: 'A boundary or safety signal indicates contact should not be encouraged.',
      guidance: 'BoriSend will not prepare a reconnection message for this recipient. If circumstances have changed, please review the relationship boundary notes in the recipient profile before continuing.',
    };
  }

  // ── Needs user review: explicit review flag ──
  if (allFlags.includes('needs_user_review') || allFlags.includes('boundary_flagged')) {
    return {
      status: 'NEEDS_USER_REVIEW',
      reason: 'A boundary flag requires your review before BoriSend prepares a message.',
      guidance: 'Please review the relationship context for this recipient before preparing a message.',
    };
  }

  // ── Caution: reconnect/distant/strained/rebuilding contexts ──
  const reconnectStates = ['distant', 'strained', 'rebuilding', 'neglected'];
  const reconnectGoals = ['reconnect', 'rebuild_trust_gradually'];
  const isReconnectContext = reconnectStates.includes(input.relationship_state) || reconnectGoals.includes(input.relationship_goal);

  if (input.relationship_state === 'strained') {
    return {
      status: 'CAUTION',
      reason: 'Relationship is strained — communication must be gentle and non-pressuring.',
      guidance: 'Keep communication gentle and avoid revisiting conflict.',
    };
  }

  if (isReconnectContext) {
    return {
      status: 'CAUTION',
      reason: 'This is a reconnection or rebuilding context — consider boundaries before communication.',
      guidance: 'Low-pressure, gentle contact is recommended. Allow the recipient space.',
    };
  }

  // ── Workplace power-dynamic caution ──
  if (input.relationship_type === 'employer_to_employee' && allFlags.includes('power_dynamic_concern')) {
    return {
      status: 'CAUTION',
      reason: 'Workplace power dynamic — keep communication professional and non-coercive.',
      guidance: 'Ensure recognition is genuine and not pressuring.',
    };
  }

  return { status: 'SAFE' };
}

export function isSafetyBlocking(safety: SafetyOutcome): boolean {
  return safety.status === 'DO_NOT_ENCOURAGE_CONTACT';
}