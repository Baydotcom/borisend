/**
 * Preference Service — plan-scoped preference learning and resolution.
 * Portable: pure logic. Entity access in backend function.
 *
 * Resolution hierarchy (highest priority first):
 * 1. Current occurrence feedback
 * 2. Recipient-specific preferences within the communication plan
 * 3. Learned communication-plan preferences
 * 4. Explicit communication-plan settings
 * 5. Category defaults
 * 6. Safe BoriSend defaults
 */

import { FeedbackRecord, reasonsToPreferenceAdjustments } from "./feedback-service.ts";
import { GenerationLimits } from "./generation-config.ts";

export interface PreferenceProfile {
  user_id: string;
  campaign_id: string;
  recipient_id: string | null;
  tone: string;
  length: string;
  writing_style: string;
  humour_level: string;
  emoji_preference: string;
  faith_content: string;
  preferred_opening: string;
  avoid_styles: string[];
  feedback_count: number;
  confidence_score: number;
  last_feedback_at: string;
  last_updated: string;
}

export interface ResolvedPreferences {
  tone: string;
  length: string;
  writing_style: string;
  humour_level: string;
  emoji_preference: string;
  faith_content: string;
  preferred_opening: string;
  avoid_styles: string[];
  source: string;
}

export interface CampaignExplicitSettings {
  tone: string;
  message_length: string;
  writing_style: string;
  category: string;
}

/**
 * Safe BoriSend defaults — lowest priority, always available.
 */
export const SAFE_DEFAULTS: ResolvedPreferences = {
  tone: "warm",
  length: "medium",
  writing_style: "conversational",
  humour_level: "low",
  emoji_preference: "never",
  faith_content: "sometimes",
  preferred_opening: "time-neutral",
  avoid_styles: [],
  source: "safe_defaults",
};

/**
 * Category defaults — applied when no learned or explicit preference exists.
 */
export const CATEGORY_DEFAULTS: Record<string, Partial<ResolvedPreferences>> = {
  love_messages: { tone: "warm", emoji_preference: "sometimes" },
  marriage_appreciation: { tone: "appreciative", emoji_preference: "sometimes" },
  daily_encouragement: { tone: "encouraging", emoji_preference: "never" },
  birthday_reminders: { tone: "warm", faith_content: "sometimes" },
  employee_appreciation: { tone: "appreciative", writing_style: "professional", emoji_preference: "never" },
  friday_appreciation: { tone: "appreciative", writing_style: "professional" },
  church_followup: { tone: "pastoral", faith_content: "often" },
  client_management: { tone: "professional", writing_style: "business", emoji_preference: "never" },
  customer_retention: { tone: "friendly", writing_style: "business", emoji_preference: "never" },
  family_checkins: { tone: "warm", emoji_preference: "sometimes" },
  prayer_reminders: { tone: "pastoral", faith_content: "often" },
  motivation: { tone: "inspirational", emoji_preference: "never" },
  custom: {},
};

/**
 * Resolve preferences using the full hierarchy.
 */
export function resolvePreferences(params: {
  currentFeedback: FeedbackRecord | null;
  recipientProfile: PreferenceProfile | null;
  planProfile: PreferenceProfile | null;
  campaignSettings: CampaignExplicitSettings;
  limits: GenerationLimits;
}): ResolvedPreferences {
  const { currentFeedback, recipientProfile, planProfile, campaignSettings, limits } = params;

  // Start with safe defaults
  let result: ResolvedPreferences = { ...SAFE_DEFAULTS, source: "safe_defaults" };

  // 5. Category defaults
  const categoryDefaults = CATEGORY_DEFAULTS[campaignSettings.category] || {};
  result = { ...result, ...categoryDefaults, source: "category_defaults" };

  // 4. Explicit campaign settings
  if (campaignSettings.tone) result.tone = campaignSettings.tone;
  if (campaignSettings.message_length) result.length = campaignSettings.message_length;
  if (campaignSettings.writing_style) result.writing_style = campaignSettings.writing_style;
  result.source = "explicit_settings";

  // 3. Learned plan preferences (only if confidence is high enough)
  if (planProfile && planProfile.confidence_score >= limits.confidence_threshold &&
      planProfile.feedback_count >= limits.feedback_count_before_adapting) {
    result = applyLearnedProfile(result, planProfile);
    result.source = "learned_plan";
  }

  // 2. Recipient-specific override (higher confidence required)
  if (recipientProfile && recipientProfile.confidence_score >= limits.confidence_threshold &&
      recipientProfile.feedback_count >= limits.feedback_count_before_adapting) {
    result = applyLearnedProfile(result, recipientProfile);
    result.source = "recipient_override";
  }

  // 1. Current occurrence feedback (highest priority)
  if (currentFeedback) {
    const adjustments = reasonsToPreferenceAdjustments(currentFeedback.reasons || []);
    if (adjustments.avoid_styles.length > 0) {
      result.avoid_styles = [...new Set([...result.avoid_styles, ...adjustments.avoid_styles])];
    }
    result.source = "current_feedback";
  }

  return result;
}

function applyLearnedProfile(
  current: ResolvedPreferences,
  profile: PreferenceProfile
): ResolvedPreferences {
  const result = { ...current };
  if (profile.tone) result.tone = profile.tone;
  if (profile.length) result.length = profile.length;
  if (profile.writing_style) result.writing_style = profile.writing_style;
  if (profile.humour_level) result.humour_level = profile.humour_level;
  if (profile.emoji_preference) result.emoji_preference = profile.emoji_preference;
  if (profile.faith_content) result.faith_content = profile.faith_content;
  if (profile.preferred_opening) result.preferred_opening = profile.preferred_opening;
  if (profile.avoid_styles) {
    result.avoid_styles = [...new Set([...result.avoid_styles, ...profile.avoid_styles])];
  }
  return result;
}

/**
 * Update a preference profile based on feedback.
 * Uses exponential moving average for confidence.
 */
export function updateProfileFromFeedback(
  profile: PreferenceProfile | null,
  feedback: FeedbackRecord,
  limits: GenerationLimits
): PreferenceProfile {
  const now = new Date().toISOString();
  const base: PreferenceProfile = profile || {
    user_id: feedback.user_id,
    campaign_id: feedback.campaign_id,
    recipient_id: feedback.recipient_id || null,
    tone: "",
    length: "",
    writing_style: "",
    humour_level: "low",
    emoji_preference: "never",
    faith_content: "sometimes",
    preferred_opening: "time-neutral",
    avoid_styles: [],
    feedback_count: 0,
    confidence_score: 0,
    last_feedback_at: now,
    last_updated: now,
  };

  const adjustments = reasonsToPreferenceAdjustments(feedback.reasons || []);
  const newCount = base.feedback_count + 1;

  // Update avoid_styles with new feedback
  const allAvoidStyles = [...new Set([...(base.avoid_styles || []), ...adjustments.avoid_styles])];

  // Confidence: increases with feedback count, weighted by EMA
  // Each "love_it" increases confidence, each "prepare_another" decreases
  const feedbackWeight = feedback.rating === "love_it" ? 0.15 : feedback.rating === "prepare_another" ? -0.1 : 0.05;
  const newConfidence = Math.min(1, Math.max(0, base.confidence_score + feedbackWeight));

  return {
    ...base,
    avoid_styles: allAvoidStyles,
    feedback_count: newCount,
    confidence_score: newConfidence,
    last_feedback_at: now,
    last_updated: now,
  };
}

/**
 * Check if a profile should decay (reduce confidence due to age or inactivity).
 */
export function shouldDecayConfidence(
  profile: PreferenceProfile,
  decayAfterDays: number = 90
): boolean {
  if (!profile.last_feedback_at) return false;
  const lastFeedback = new Date(profile.last_feedback_at);
  const ageDays = (Date.now() - lastFeedback.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > decayAfterDays;
}

/**
 * Apply confidence decay.
 */
export function applyConfidenceDecay(profile: PreferenceProfile): PreferenceProfile {
  return {
    ...profile,
    confidence_score: Math.max(0, profile.confidence_score * 0.5),
    last_updated: new Date().toISOString(),
  };
}