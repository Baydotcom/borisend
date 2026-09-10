/**
 * Relationship Intelligence — Type definitions.
 * Provider-neutral and portable — no Base44 dependencies.
 *
 * The provider (LLM) does NOT decide relationship strategy. BoriSend
 * determines the communication strategy deterministically; the provider
 * only performs natural-language expression of the MessageSpecification.
 */

import type { Daypart } from '../message-engine/types.ts';

export type SafetyStatus = 'SAFE' | 'CAUTION' | 'DO_NOT_ENCOURAGE_CONTACT' | 'NEEDS_USER_REVIEW';

export interface SafetyOutcome {
  status: SafetyStatus;
  reason?: string;
  guidance?: string; // neutral user-facing guidance
}

export interface RecommendedFrequencyRange {
  min_per_week: number;
  max_per_week: number;
  description: string;
}

export interface RelationshipStrategy {
  strategy_key: string;
  objective: string;
  principles: string[];
  encouraged_behaviours: string[];
  avoid_behaviours: string[];
  recommended_tone: string;
  communication_boundary_notes: string[];
  recommended_frequency_range: RecommendedFrequencyRange;
  allowed_message_intents: string[];
  disallowed_message_intents: string[];
  escalation_notes: string;
  de_escalation_notes: string;
  safety_status: SafetyStatus;
  safety_reason?: string;
}

export interface CommunicationIntent {
  intent_key: string;
  display_label: string;
  description: string;
  applicable_families: string[]; // category system_keys; '*' = all
}

export interface MessageSpecification {
  user_id: string;
  communication_plan_id: string;
  plan_recipient_id: string | null;
  relationship_category: string;
  relationship_type: string;
  relationship_state: string;
  relationship_goal: string;
  strategy_key: string;
  strategy_objective: string;
  message_intent: string;
  communication_mode: 'shared' | 'personalised';
  tone: string;
  length_guidance: string;
  timing_daypart: Daypart;
  timezone: string;
  recipient_context: string;
  relationship_memory: string[];
  recent_communication_themes: string[];
  avoid_instructions: string[];
  learned_plan_preferences: string[];
  recipient_specific_preferences: string[];
  safety_constraints: string[];
  language_locale: string;
  principles: string[];
  encouraged_behaviours: string[];
}

export interface RhythmRecommendation {
  recommended_frequency: RecommendedFrequencyRange;
  reason: string;
  allowed_range: RecommendedFrequencyRange;
}

export interface MemoryItem {
  memory_type: string;
  content: string;
  related_date?: string;
  is_active: boolean;
}

export interface IntelligenceInput {
  relationship_category: string; // system_key
  relationship_type: string; // system_key
  relationship_state: string; // system_key
  relationship_goal: string; // system_key
  communication_mode: 'shared' | 'personalised';
  recipient_context: string;
  plan_recipient_id: string | null;
  memories: MemoryItem[];
  recent_intents: string[]; // intents of recently sent messages, oldest→newest
  recent_communication_themes: string[];
  learned_plan_preferences: string[];
  recipient_specific_preferences: string[];
  explicit_tone: string;
  explicit_length: string;
  language_locale: string;
  timing_daypart: Daypart;
  timezone: string;
  user_id: string;
  communication_plan_id: string;
  explicit_boundary_flags: string[];
}

export interface PipelineResult {
  specification: MessageSpecification | null;
  strategy: RelationshipStrategy;
  intent: string;
  safety: SafetyOutcome;
  rhythm: RhythmRecommendation;
  blocked: boolean;
  block_reason?: string;
}