/**
 * Rhythm Engine — Recommends a natural communication rhythm (§13).
 * Deterministic, provider-neutral. Does NOT override user choice — returns a
 * recommendation, reason, and allowed range for the user to accept or customise.
 */

import type { IntelligenceInput, RelationshipStrategy, RhythmRecommendation, RecommendedFrequencyRange } from './types.ts';

const BROAD_ALLOWED_RANGE: RecommendedFrequencyRange = {
  min_per_week: 1,
  max_per_week: 7,
  description: 'Any frequency from weekly to daily',
};

export function recommendRhythm(
  input: IntelligenceInput,
  strategy: RelationshipStrategy
): RhythmRecommendation {
  const freq = strategy.recommended_frequency_range;
  const reason = buildReason(input, strategy, freq);
  return {
    recommended_frequency: freq,
    reason,
    allowed_range: BROAD_ALLOWED_RANGE,
  };
}

function buildReason(
  input: IntelligenceInput,
  strategy: RelationshipStrategy,
  freq: RecommendedFrequencyRange
): string {
  const parts: string[] = [];

  if (['distant', 'strained', 'rebuilding', 'neglected'].includes(input.relationship_state) ||
      ['reconnect', 'rebuild_trust_gradually'].includes(input.relationship_goal)) {
    parts.push('Low-pressure periodic contact is recommended for reconnection or rebuilding contexts');
  } else if (input.relationship_category === 'romantic_marital') {
    parts.push('Frequent, near-daily contact suits a healthy spouse or partner relationship');
  } else if (input.relationship_category === 'business_customer') {
    parts.push('Periodic or milestone-driven contact is typical for client relationships');
  } else if (input.relationship_category === 'workplace_professional') {
    parts.push('Event-driven or periodic recognition suits professional relationships');
  } else if (input.relationship_category === 'faith_spiritual') {
    parts.push('Periodic, contextual contact is typical for pastoral care');
  } else {
    parts.push('Regular, consistent contact maintains this relationship');
  }

  if (input.communication_mode === 'shared') {
    parts.push('shared communication uses one message across recipients');
  }

  parts.push(`suggested range: ${freq.min_per_week}–${freq.max_per_week} per week`);
  return parts.join('; ') + '.';
}