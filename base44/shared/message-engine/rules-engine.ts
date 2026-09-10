/**
 * MessageRulesEngine — Provider-independent rules that apply before and after generation.
 * Determines time-specific language permissions, prohibited phrases, and repetition rules.
 * Portable: no Base44 dependencies.
 */

import { GenerationContext, RulesContext, Daypart } from './types.ts';
import { getProhibitedGreetings } from './time-context.ts';

export function buildRules(
  approvalMode: string,
  scheduleType: string,
  hasRecentMessages: boolean
): RulesContext {
  // For manual approval, the user may send later — prefer time-neutral openings
  // unless the scheduled time is reliable (specific_daily at a fixed hour)
  const isRandomOrFlexible = scheduleType === 'random_daily' || scheduleType === 'custom';
  const preferNeutral = approvalMode === 'manual' && isRandomOrFlexible;

  return {
    avoid_repetition: hasRecentMessages,
    avoid_wrong_daypart: true,
    avoid_wrong_weekday: true,
    avoid_provider_language: true,
    prefer_time_neutral_opening: preferNeutral,
  };
}

export function getTimeSpecificLanguageAllowed(
  approvalMode: string,
  scheduleType: string
): boolean {
  // Time-specific language is allowed when the delivery time is reliable
  // Automatic mode: message is sent at the scheduled time
  // Specific daily: fixed hour, reliable
  // Random daily: stored next_scheduled, reliable if automatic
  if (approvalMode === 'automatic') return true;
  if (scheduleType === 'specific_daily' || scheduleType === 'twice_daily') return true;
  return false;
}

export function getProhibitedPhrases(context: GenerationContext): string[] {
  const prohibited = getProhibitedGreetings(context.delivery.daypart);

  // Add provider/AI language prohibition
  const providerPhrases = [
    'ai', 'artificial intelligence', 'as an ai', 'language model',
    'i am a model', 'i cannot', 'i apologize',
    'here is your message', 'certainly', 'i hope this helps',
  ];

  return [...prohibited, ...providerPhrases];
}

export function shouldUseTimeNeutralOpening(context: GenerationContext): boolean {
  if (context.rules.prefer_time_neutral_opening) return true;
  // For night time, time-neutral is safer
  if (context.delivery.daypart === 'night') return true;
  return false;
}