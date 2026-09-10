import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getEligibleGoals } from '../../shared/relationship-intelligence/goal-eligibility.ts';
import { resolveStrategy } from '../../shared/relationship-intelligence/strategy-engine.ts';
import { recommendRhythm } from '../../shared/relationship-intelligence/rhythm-engine.ts';
import type { IntelligenceInput } from '../../shared/relationship-intelligence/types.ts';

/**
 * Returns relationship intelligence metadata for the frontend:
 *  - eligible goals for a relationship category/type
 *  - rhythm recommendation for a given state/goal
 *
 * No LLM calls — fully deterministic.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { relationship_category, relationship_type, relationship_state, relationship_goal } = body;

    if (!relationship_category && !relationship_type) {
      return Response.json({ error: 'relationship_category or relationship_type is required' }, { status: 400 });
    }

    const eligibleGoals = getEligibleGoals(relationship_category || '', relationship_type || '');

    let rhythm: any = null;
    let strategy: any = null;
    if (relationship_state && relationship_goal) {
      const input: IntelligenceInput = {
        relationship_category: relationship_category || '',
        relationship_type: relationship_type || '',
        relationship_state,
        relationship_goal,
        communication_mode: 'personalised',
        recipient_context: '',
        plan_recipient_id: null,
        memories: [],
        recent_intents: [],
        recent_communication_themes: [],
        learned_plan_preferences: [],
        recipient_specific_preferences: [],
        explicit_tone: '',
        explicit_length: '',
        language_locale: 'en',
        timing_daypart: 'morning',
        timezone: 'UTC',
        user_id: 'preview',
        communication_plan_id: 'preview',
        explicit_boundary_flags: [],
      };
      strategy = resolveStrategy(input);
      rhythm = recommendRhythm(input, strategy);
    }

    return Response.json({
      eligible_goals: eligibleGoals,
      strategy: strategy ? {
        strategy_key: strategy.strategy_key,
        objective: strategy.objective,
        recommended_tone: strategy.recommended_tone,
        allowed_intents: strategy.allowed_message_intents,
        avoid_behaviours: strategy.avoid_behaviours,
        principles: strategy.principles,
      } : null,
      rhythm,
    });
  } catch (error) {
    console.error('[getRelationshipIntelligence] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});