/**
 * Message Specification Builder — Constructs the provider-neutral
 * MessageSpecification that becomes the provider input (§17).
 * Does not send unnecessary database objects or private data to the provider.
 */

import type {
  IntelligenceInput, RelationshipStrategy, SafetyOutcome,
  MessageSpecification, MemoryItem,
} from './types.ts';
import { selectRelevantMemories, findImminentImportantDate } from './memory-selector.ts';

export function buildMessageSpecification(
  input: IntelligenceInput,
  strategy: RelationshipStrategy,
  intent: string,
  safety: SafetyOutcome
): MessageSpecification {
  const selectedMemories = selectRelevantMemories(input.memories, intent);
  const memoryStrings = selectedMemories.map(m => {
    if (m.memory_type === 'important_date' && m.related_date) {
      return `${m.content} (date: ${m.related_date})`;
    }
    return m.content;
  });

  // Safety constraints surface in the specification (not the raw safety outcome)
  const safetyConstraints: string[] = [];
  if (safety.status === 'CAUTION') {
    safetyConstraints.push(...strategy.communication_boundary_notes);
  }
  if (safety.status === 'NEEDS_USER_REVIEW') {
    safetyConstraints.push('Review relationship context before sending.');
  }

  return {
    user_id: input.user_id,
    communication_plan_id: input.communication_plan_id,
    plan_recipient_id: input.plan_recipient_id,
    relationship_category: input.relationship_category,
    relationship_type: input.relationship_type,
    relationship_state: input.relationship_state,
    relationship_goal: input.relationship_goal,
    strategy_key: strategy.strategy_key,
    strategy_objective: strategy.objective,
    message_intent: intent,
    communication_mode: input.communication_mode,
    tone: input.explicit_tone || strategy.recommended_tone,
    length_guidance: input.explicit_length || 'medium',
    timing_daypart: input.timing_daypart,
    timezone: input.timezone,
    recipient_context: input.recipient_context || '',
    relationship_memory: memoryStrings,
    recent_communication_themes: input.recent_communication_themes || [],
    avoid_instructions: strategy.avoid_behaviours,
    learned_plan_preferences: input.learned_plan_preferences || [],
    recipient_specific_preferences: input.recipient_specific_preferences || [],
    safety_constraints: safetyConstraints,
    language_locale: input.language_locale || 'en',
    principles: strategy.principles,
    encouraged_behaviours: strategy.encouraged_behaviours,
  };
}