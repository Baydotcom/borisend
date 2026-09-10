/**
 * Context Loader — Base44-specific bridge that loads taxonomy, PlanRecipient,
 * and RelationshipMemory data and passes plain objects to the portable
 * Intelligence Pipeline. Isolates all Base44 entity access so the pipeline
 * stays provider-independent and portable (§36 — owner-scoped).
 *
 * Returns null for legacy plans (no relationship_type_id) so the existing
 * generation pathway continues unchanged (§34).
 */

import { runIntelligencePipeline } from './pipeline.ts';
import type { IntelligenceInput, PipelineResult, MemoryItem } from './types.ts';
import { getDaypart } from '../message-engine/time-context.ts';
import { buildOutcomeSignals } from '../message-engine/outcome-signal-service.ts';

export async function loadIntelligenceContext(
  client: any,
  params: {
    campaign: any;
    recipient: any;
    userId: string;
    deliveryTimeUtc: string;
    userTimezone: string;
    language: string;
    planRecipientId?: string | null;
    recentIntents?: string[];
    learnedPlanPreferences?: string[];
  }
): Promise<PipelineResult | null> {
  const campaign = params.campaign;
  const userId = params.userId;

  // ── Legacy plan: no relationship taxonomy → use existing pathway ──
  if (!campaign.relationship_type_id && !campaign.relationship_category_id) {
    return null;
  }

  // ── Resolve taxonomy system_keys from entity IDs ──
  let categoryKey = campaign.relationship_category_system_key || '';
  let typeKey = '';
  let stateKey = '';
  let goalKey = '';

  if (campaign.relationship_type_id) {
    try {
      const types = await client.entities.RelationshipType.filter({ id: campaign.relationship_type_id });
      if (types[0]) {
        typeKey = types[0].system_key;
        if (!categoryKey) categoryKey = types[0].category_system_key || '';
      }
    } catch { /* ignore */ }
  }
  if (campaign.relationship_state_id) {
    try {
      const states = await client.entities.RelationshipState.filter({ id: campaign.relationship_state_id });
      stateKey = states[0]?.system_key || '';
    } catch { /* ignore */ }
  }
  if (campaign.relationship_goal_id) {
    try {
      const goals = await client.entities.RelationshipGoal.filter({ id: campaign.relationship_goal_id });
      goalKey = goals[0]?.system_key || '';
    } catch { /* ignore */ }
  }

  if (!typeKey && !categoryKey) return null;

  const communicationMode = campaign.message_mode || 'personalised';

  // ── Resolve PlanRecipient + memory (owner-scoped) ──
  let planRecipientId: string | null = params.planRecipientId || null;
  let recipientContext = '';
  let memories: MemoryItem[] = [];
  let recipientPrefs: string[] = [];

  try {
    const activePRs = await client.entities.PlanRecipient.filter({
      campaign_id: campaign.id,
      owner_user_id: userId,
      status: 'active',
    });

    let matchedPR: any = null;

    if (communicationMode === 'personalised') {
      if (planRecipientId) {
        matchedPR = activePRs.find((pr: any) => pr.id === planRecipientId);
      }
      if (!matchedPR && activePRs.length > 0) {
        // Best-effort match by contact name/phone
        const recipientName = (params.recipient?.name || '').toLowerCase().trim();
        if (recipientName && activePRs.length > 0) {
          const contactIds = activePRs.map((pr: any) => pr.contact_id).filter(Boolean);
          if (contactIds.length > 0) {
            const contacts = await client.entities.Contact.filter({ id: { $in: contactIds } });
            const contactMap = new Map(contacts.map((c: any) => [c.id, c]));
            matchedPR = activePRs.find((pr: any) => {
              const c = contactMap.get(pr.contact_id);
              if (!c) return false;
              return (c.display_name || '').toLowerCase().trim() === recipientName ||
                     `${(c.first_name || '').toLowerCase()} ${(c.last_name || '').toLowerCase()}`.trim() === recipientName;
            });
          }
        }
        if (!matchedPR) matchedPR = activePRs[0]; // fallback to first active
      }
    } else {
      // Shared mode: use first active PR for context (memory is not recipient-specific)
      matchedPR = activePRs[0] || null;
    }

    if (matchedPR) {
      planRecipientId = matchedPR.id;
      recipientContext = matchedPR.recipient_context || '';

      // Per-recipient state/goal override (PlanRecipient can override campaign-level)
      if (matchedPR.relationship_state_id) {
        try {
          const prStates = await client.entities.RelationshipState.filter({ id: matchedPR.relationship_state_id });
          if (prStates[0]) stateKey = prStates[0].system_key || stateKey;
        } catch { /* ignore */ }
      }
      if (matchedPR.relationship_goal_id) {
        try {
          const prGoals = await client.entities.RelationshipGoal.filter({ id: matchedPR.relationship_goal_id });
          if (prGoals[0]) goalKey = prGoals[0].system_key || goalKey;
        } catch { /* ignore */ }
      }

      // Load active memories for this PlanRecipient (owner-scoped)
      const prMemories = await client.entities.RelationshipMemory.filter({
        plan_recipient_id: matchedPR.id,
        owner_user_id: userId,
        is_active: true,
      });
      memories = prMemories.map((m: any) => ({
        memory_type: m.memory_type,
        content: m.content,
        related_date: m.related_date,
        is_active: true,
      }));

      // RC16.5: Load recent message outcomes for recipient-specific preference
      // signals. Deterministic — no additional LLM call. Uses existing Message
      // status + MessageFeedback to build compact preference hints.
      try {
        const recentRecipientMessages = await client.entities.Message.filter(
          { campaign_id: campaign.id, user_id: userId },
          '-created_date', 20
        );
        const recipientMessages = planRecipientId
          ? recentRecipientMessages.filter((m: any) => m.plan_recipient_id === planRecipientId)
          : recentRecipientMessages;
        if (recipientMessages.length > 0) {
          const messageIds = recipientMessages.map((m: any) => m.id);
          const feedbacks = await client.entities.MessageFeedback.filter(
            { message_id: { $in: messageIds } }
          ).catch(() => []);
          const outcomeSummary = buildOutcomeSignals(recipientMessages, feedbacks);
          recipientPrefs = outcomeSummary.signals;
        }
      } catch { /* non-blocking — continue without outcome signals */ }
    }
  } catch (e) {
    // Non-blocking: continue without per-recipient context
  }

  // ── Resolve timing daypart ──
  let daypart: any = 'morning';
  try {
    const date = new Date(params.deliveryTimeUtc);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: params.userTimezone || 'UTC',
      hour: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let hour = parseInt(parts.find((p: any) => p.type === 'hour')?.value || '9', 10);
    if (hour === 24) hour = 0;
    daypart = getDaypart(hour);
  } catch { /* default morning */ }

  // ── Build IntelligenceInput ──
  const input: IntelligenceInput = {
    relationship_category: categoryKey,
    relationship_type: typeKey,
    relationship_state: stateKey,
    relationship_goal: goalKey,
    communication_mode: communicationMode,
    recipient_context: recipientContext,
    plan_recipient_id: planRecipientId,
    memories,
    recent_intents: params.recentIntents || [],
    recent_communication_themes: [],
    learned_plan_preferences: params.learnedPlanPreferences || [],
    recipient_specific_preferences: recipientPrefs,
    explicit_tone: campaign.tone || '',
    explicit_length: campaign.message_length || '',
    language_locale: params.language_display_name || params.language || 'English',
    timing_daypart: daypart,
    timezone: params.userTimezone || 'UTC',
    user_id: userId,
    communication_plan_id: campaign.id,
    explicit_boundary_flags: [],
  };

  return runIntelligencePipeline(input);
}