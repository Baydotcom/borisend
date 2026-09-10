/**
 * MessageContextBuilder — Constructs the provider-neutral GenerationContext.
 * Orchestrates Time, Relationship, and Occasion context services.
 * Portable: no Base44 dependencies.
 */

import {
  GenerationContext, CampaignContext, RecipientContext,
  MessageContext, RulesContext,
} from './types.ts';
import { buildTimeContext } from './time-context.ts';
import { buildRecipientContext, getRelationship } from './relationship-context.ts';
import { getPurpose, getOccasion } from './occasion-context.ts';
import { buildRules, getTimeSpecificLanguageAllowed } from './rules-engine.ts';

// RC16.8: Language display name is resolved by language-resolver.ts and passed
// directly — no hardcoded language map. The authoritative source is the
// MessageLanguage entity, resolved via the hierarchy in language-resolver.ts.

export function buildCampaignContext(campaign: any): CampaignContext {
  return {
    id: campaign.id || '',
    name: campaign.name || '',
    category: campaign.category || 'custom',
    instructions: campaign.additional_instructions || '',
    approval_mode: campaign.approval_mode || 'manual',
    tone: campaign.tone || 'warm',
    message_length: campaign.message_length || 'medium',
    writing_style: campaign.writing_style || 'conversational',
    pet_name: campaign.pet_name || '',
    purpose: campaign.purpose || '',
  };
}

export function buildMessageContext(
  campaign: CampaignContext,
  timeSpecificAllowed: boolean
): MessageContext {
  return {
    purpose: campaign.purpose || getOccasion(campaign.category),
    tone: campaign.tone,
    length: campaign.message_length,
    time_specific_language_allowed: timeSpecificAllowed,
  };
}

export function buildGenerationContext(params: {
  campaign: any;
  recipientName: string;
  language: string;
  language_display_name?: string;
  deliveryTimeUtc: string;
  userTimezone: string;
  recentMessages: string[];
  preferences?: import('./types.ts').PreferencesContext;
}): GenerationContext {
  const campaignCtx = buildCampaignContext(params.campaign);
  const delivery = buildTimeContext(
    params.deliveryTimeUtc,
    params.userTimezone,
    params.campaign.schedule_type || 'specific_daily'
  );
  const recipient = buildRecipientContext(
    campaignCtx,
    params.recipientName,
    params.language_display_name || params.language || 'English'
  );

  const timeSpecificAllowed = getTimeSpecificLanguageAllowed(
    campaignCtx.approval_mode,
    delivery.schedule_type
  );

  // Apply learned preferences to message context if provided
  let message = buildMessageContext(campaignCtx, timeSpecificAllowed);
  if (params.preferences) {
    if (params.preferences.tone) message.tone = params.preferences.tone;
    if (params.preferences.length) message.length = params.preferences.length;
  }

  const rules = buildRules(
    campaignCtx.approval_mode,
    delivery.schedule_type,
    params.recentMessages.length > 0
  );

  // Apply writing style preference to campaign context
  let campaignCtxWithPrefs = campaignCtx;
  if (params.preferences?.writing_style) {
    campaignCtxWithPrefs = { ...campaignCtx, writing_style: params.preferences.writing_style };
  }

  return {
    request_id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campaign: campaignCtxWithPrefs,
    recipient,
    delivery,
    message,
    rules,
    preferences: params.preferences,
  };
}