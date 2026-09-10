/**
 * Strategy Engine — Resolves a RelationshipStrategy from structured inputs.
 * Deterministic, provider-neutral, portable (§4, §31).
 *
 * Merge order: base family strategy → state override → goal override.
 * The strategy's safety_status is preliminary; the Safety Engine makes the
 * final safety determination.
 */

import type { IntelligenceInput, RelationshipStrategy } from './types.ts';
import { BASE_STRATEGIES, STATE_OVERRIDES, GOAL_OVERRIDES, SAFE_FALLBACK_STRATEGY } from './strategy-library.ts';

function clone(s: RelationshipStrategy): RelationshipStrategy {
  return {
    ...s,
    principles: [...s.principles],
    encouraged_behaviours: [...s.encouraged_behaviours],
    avoid_behaviours: [...s.avoid_behaviours],
    communication_boundary_notes: [...s.communication_boundary_notes],
    allowed_message_intents: [...s.allowed_message_intents],
    disallowed_message_intents: [...s.disallowed_message_intents],
    recommended_frequency_range: { ...s.recommended_frequency_range },
  };
}

/**
 * Merge a partial override into a strategy. Rules:
 *  - Scalar fields override if present.
 *  - allowed_message_intents REPLACES if present (state/goal narrow the set).
 *  - principles / encouraged_behaviours / avoid_behaviours REPLACE if present.
 *  - communication_boundary_notes and disallowed_message_intents are unioned.
 */
function merge(base: RelationshipStrategy, override: Partial<RelationshipStrategy>): RelationshipStrategy {
  const result = clone(base);
  const o = override as any;
  if (o.objective) result.objective = o.objective;
  if (o.recommended_tone) result.recommended_tone = o.recommended_tone;
  if (o.recommended_frequency_range) result.recommended_frequency_range = { ...o.recommended_frequency_range };
  if (o.escalation_notes) result.escalation_notes = o.escalation_notes;
  if (o.de_escalation_notes) result.de_escalation_notes = o.de_escalation_notes;
  if (o.safety_status) result.safety_status = o.safety_status;
  if (o.safety_reason) result.safety_reason = o.safety_reason;
  if (o.principles) result.principles = [...o.principles];
  if (o.encouraged_behaviours) result.encouraged_behaviours = [...o.encouraged_behaviours];
  if (o.avoid_behaviours) result.avoid_behaviours = [...o.avoid_behaviours];
  if (o.allowed_message_intents) result.allowed_message_intents = [...o.allowed_message_intents];
  if (o.disallowed_message_intents) result.disallowed_message_intents = [...new Set([...result.disallowed_message_intents, ...o.disallowed_message_intents])];
  if (o.communication_boundary_notes) result.communication_boundary_notes = [...new Set([...result.communication_boundary_notes, ...o.communication_boundary_notes])];
  return result;
}

function composeKey(category: string, state: string, goal: string): string {
  const parts = [category || 'unknown'];
  if (state) parts.push(state);
  if (goal) parts.push(goal);
  return parts.join('::');
}

export function resolveStrategy(input: IntelligenceInput): RelationshipStrategy {
  const base = BASE_STRATEGIES[input.relationship_category] || SAFE_FALLBACK_STRATEGY;
  let strategy = clone(base);

  const stateOverride = STATE_OVERRIDES[input.relationship_state];
  if (stateOverride) strategy = merge(strategy, stateOverride);

  const goalOverride = GOAL_OVERRIDES[input.relationship_goal];
  if (goalOverride) strategy = merge(strategy, goalOverride);

  strategy.strategy_key = composeKey(input.relationship_category, input.relationship_state, input.relationship_goal);
  return strategy;
}