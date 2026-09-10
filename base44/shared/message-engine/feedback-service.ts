/**
 * Feedback Service — records and evaluates satisfaction feedback.
 * Portable: pure logic for feedback processing.
 */

export interface FeedbackRecord {
  id: string;
  user_id: string;
  campaign_id: string;
  message_id: string;
  generation_key: string;
  rating: "love_it" | "its_okay" | "prepare_another";
  reasons: string[];
  custom_reason: string;
  improvement_action: string;
  recipient_id: string;
  version_number: number;
  created_date: string;
}

export interface FeedbackResult {
  shouldLearn: boolean;
  shouldGenerateAlternative: boolean;
  reasons: string[];
}

/**
 * Evaluate whether feedback should be learned from.
 * Never learn from technical failures or fallback messages.
 */
export function evaluateFeedback(feedback: FeedbackRecord): FeedbackResult {
  const shouldLearn = feedback.rating !== "love_it" || feedback.reasons.length > 0;
  const shouldGenerateAlternative = feedback.rating === "prepare_another";
  return {
    shouldLearn,
    shouldGenerateAlternative,
    reasons: feedback.reasons,
  };
}

/**
 * Map feedback reasons to preference adjustments.
 */
export function reasonsToPreferenceAdjustments(
  reasons: string[]
): { avoid_styles: string[]; tone_hints: string[] } {
  const avoid_styles: string[] = [];
  const tone_hints: string[] = [];

  for (const reason of reasons) {
    switch (reason) {
      case "too_formal":
        avoid_styles.push("formal");
        tone_hints.push("casual");
        break;
      case "too_casual":
        avoid_styles.push("casual");
        tone_hints.push("professional");
        break;
      case "too_romantic":
        avoid_styles.push("overly romantic");
        tone_hints.push("warm");
        break;
      case "not_warm_enough":
        tone_hints.push("warmer");
        break;
      case "too_long":
        tone_hints.push("shorter");
        break;
      case "too_short":
        tone_hints.push("longer");
        break;
      case "did_not_sound_natural":
        avoid_styles.push("overly poetic");
        tone_hints.push("natural");
        break;
      case "did_not_sound_like_me":
        avoid_styles.push("generic");
        tone_hints.push("personal");
        break;
      case "did_not_fit_occasion":
        tone_hints.push("occasion-appropriate");
        break;
      case "wrong_humour_level":
        tone_hints.push("adjust humour");
        break;
      case "wrong_emoji_usage":
        tone_hints.push("adjust emojis");
        break;
    }
  }

  return { avoid_styles: [...new Set(avoid_styles)], tone_hints: [...new Set(tone_hints)] };
}

/**
 * Check if feedback indicates a valid learning signal.
 * Ignore feedback on fallback messages or messages that were never sent.
 */
export function isValidLearningSignal(
  feedback: FeedbackRecord,
  messageWasFallback: boolean
): boolean {
  if (messageWasFallback) return false;
  if (feedback.rating === "prepare_another" && feedback.reasons.length === 0) return false;
  return true;
}