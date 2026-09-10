/**
 * MessagePromptBuilder — Builds provider-neutral prompts from GenerationContext.
 * Neutralizes time-of-day words in campaign names to prevent bias.
 * Portable: no Base44 dependencies.
 */

import { GenerationContext } from './types.ts';
import { getAllowedGreetings } from './time-context.ts';
import { shouldUseTimeNeutralOpening } from './rules-engine.ts';
import type { MessageSpecification } from '../relationship-intelligence/types.ts';
import { getIntentDisplayLabel } from '../relationship-intelligence/intent-library.ts';

/**
 * Removes time-of-day words from campaign names to prevent the provider
 * from being biased toward morning/evening language regardless of actual delivery time.
 */
export function neutralizeTimeWords(name: string): string {
  const neutralized = name
    .replace(/\bmorning\b/gi, '')
    .replace(/\bafternoon\b/gi, '')
    .replace(/\bevening\b/gi, '')
    .replace(/\bnight\b/gi, '')
    .replace(/\bnoon\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return neutralized || name;
}

export function buildPrompt(
  context: GenerationContext,
  recentMessages: string[]
): string {
  const { campaign, recipient, delivery, message, rules } = context;
  const neutralName = neutralizeTimeWords(campaign.name);
  const allowedGreetings = getAllowedGreetings(delivery.daypart);
  const preferNeutral = shouldUseTimeNeutralOpening(context);

  let prompt = `Write a single SMS text message from one person to their ${recipient.relationship}.

Recipient name: ${recipient.name}
${campaign.pet_name ? `Pet name to use: ${campaign.pet_name}` : ''}
Occasion: ${message.purpose}
Tone: ${message.tone}
Length: ${message.length}
Writing style: ${campaign.writing_style}
Language: ${recipient.language}
${campaign.instructions ? `Additional instructions: ${campaign.instructions}` : ''}

Delivery time context:
- Daypart: ${delivery.daypart}
- Local time: ${delivery.local_time}
- Weekday: ${delivery.weekday}
- Date: ${delivery.local_date}
- Timezone: ${delivery.timezone}
`;

  // Time-specific rules
  prompt += `\nTiming rules:\n`;
  prompt += `- This message will be delivered in the ${delivery.daypart} (${delivery.local_time} local time on ${delivery.weekday}).\n`;
  prompt += `- ONLY use greetings appropriate for the ${delivery.daypart}: ${allowedGreetings.join(', ')}.\n`;
  prompt += `- Do NOT use greetings for other times of day (no morning greetings in the afternoon/evening, etc.).\n`;
  prompt += `- If you mention the time of day, it MUST be "${delivery.daypart}" and match the delivery time.\n`;

  if (preferNeutral) {
    prompt += `- Since this message may be sent manually, prefer a time-neutral opening that works at any time of day. You may still reference the ${delivery.daypart} subtly.\n`;
  }

  if (rules.avoid_repetition && recentMessages.length > 0) {
    prompt += `\nAvoid repeating these previously sent messages — do not reuse their openings, themes, or phrases:\n`;
    prompt += recentMessages.map(m => `- "${m.substring(0, 200)}"`).join('\n');
    prompt += '\n';
  }

  // Weekday rule
  if (rules.avoid_wrong_weekday) {
    prompt += `\n- If you reference a day, it must be ${delivery.weekday} (${delivery.local_date}).\n`;
  }

  // Learned preferences (plan-scoped)
  if (context.preferences) {
    const prefs = context.preferences;
    prompt += `\nLearned preferences for this communication plan:\n`;
    if (prefs.humour_level) {
      prompt += `- Humour level: ${prefs.humour_level} (none = no humour, low = subtle, medium = moderate, high = playful)\n`;
    }
    if (prefs.emoji_preference) {
      prompt += `- Emoji usage: ${prefs.emoji_preference} (never = no emojis, rarely = occasional, sometimes = moderate, often = frequent)\n`;
    }
    if (prefs.faith_content && prefs.faith_content !== 'sometimes') {
      prompt += `- Faith/spiritual content: ${prefs.faith_content}\n`;
    }
    if (prefs.avoid_styles && prefs.avoid_styles.length > 0) {
      prompt += `- Avoid these styles based on user feedback: ${prefs.avoid_styles.join(', ')}\n`;
    }
  }

  // Factual grounding — anti-fabrication (RC16)
  prompt += `\nFactual grounding rules (CRITICAL — must follow):\n`;
  prompt += `- ONLY reference a specific event, meal, visit, trip, conversation, gift, activity, or recent experience if it is explicitly stated in the context or instructions above.\n`;
  prompt += `- Do NOT invent or assume any personal event, experience, date, milestone, or circumstance that is not provided.\n`;
  prompt += `- Do NOT reference "last night", "yesterday", "recently", or any specific occasion unless it is in the provided context.\n`;
  prompt += `- Do NOT attribute feelings, thoughts, or statements to the recipient. Do NOT invent things they supposedly said or that you supposedly did.\n`;
  prompt += `- Relationship type, state, goal, and tone guide HOW to write — they must NOT be turned into invented specific events.\n`;
  prompt += `- When no specific facts are available, write a naturally warm, genuine message that does NOT pretend any specific event occurred.\n`;

  // Provider language prohibition
  prompt += `\nStrictly prohibited:\n`;
  prompt += `- Never mention AI, models, prompts, providers, or machine learning\n`;
  prompt += `- Never sound robotic, automated, or like a template\n`;
  prompt += `- Never start with "Here is" or "Certainly" or "I hope this helps"\n`;
  prompt += `- Never use phrases like "as an AI" or "I am a language model"\n`;

  prompt += `\nQuality rules:\n`;
  prompt += `- Sound completely human and natural\n`;
  prompt += `- Be unique, genuine, and heartfelt\n`;
  prompt += `- Match the tone perfectly\n`;
  prompt += `- The message should feel like it was written by someone who truly cares\n`;
  prompt += `- Generate the final communication directly in ${recipient.language} — do NOT write in English first and then translate\n`;
  prompt += `- Return ONLY the message text, nothing else. No quotes, no labels, no explanations.\n`;

  return prompt;
}

/**
 * Builds a correction prompt when validation fails, with explicit instructions
 * to fix the identified issues.
 */
export function buildCorrectionPrompt(
  originalPrompt: string,
  issues: { code: string; message: string }[]
): string {
  const issueList = issues.map(i => `- ${i.message}`).join('\n');
  return `${originalPrompt}

IMPORTANT: The previous attempt had these problems and must be corrected:
${issueList}

Please rewrite the message fixing ALL of the above issues. Return ONLY the corrected message text.`;
}

/**
 * Strategy-Aware Prompt Builder — Builds a provider-neutral prompt from a
 * MessageSpecification (§17, §18). The LLM only performs natural-language
 * expression of the deterministic strategy; it does NOT decide the strategy.
 * Only resolved context is sent — no unnecessary database objects or private data.
 */
export function buildStrategyPrompt(
  spec: MessageSpecification,
  recentMessages: string[]
): string {
  const allowedGreetings = getAllowedGreetings(spec.timing_daypart);

  let prompt = `Write a single SMS text message from one person to their ${spec.relationship_type.replace(/_/g, ' ')}.

Relationship context:
- Relationship type: ${spec.relationship_type.replace(/_/g, ' ')}
- Current state: ${spec.relationship_state.replace(/_/g, ' ')}
- Communication goal: ${spec.relationship_goal.replace(/_/g, ' ')}
- Communication strategy: ${spec.strategy_key}
- Strategy objective: ${spec.strategy_objective}

Communication intent for this message: ${getIntentDisplayLabel(spec.message_intent)} (${spec.message_intent})

Principles to follow: ${spec.principles.join(', ')}
Encouraged behaviours: ${spec.encouraged_behaviours.join('; ')}
Avoid: ${spec.avoid_instructions.join('; ')}

Tone: ${spec.tone}
Length: ${spec.length_guidance}
Language: ${spec.language_locale}
`;

  if (spec.recipient_context) {
    prompt += `\nRecipient context: ${spec.recipient_context}\n`;
  }

  // ── RC16.2: KNOWN FACTS / SAFE CONTEXT / UNKNOWN factual grounding ──
  // Distinguish explicitly what is known (may be referenced naturally),
  // what is safe context (guides tone/strategy but does NOT authorise invented
  // events), and what is unknown (must not be fabricated).
  if (spec.relationship_memory && spec.relationship_memory.length > 0) {
    prompt += `\nKNOWN FACTS (these are real, user-provided facts — may be referenced naturally):\n`;
    for (const m of spec.relationship_memory) {
      prompt += `- ${m}\n`;
    }
  } else {
    prompt += `\nKNOWN FACTS: None provided for this recipient.\n`;
  }

  prompt += `\nSAFE CONTEXT (guides tone and approach — does NOT authorise invented events):\n`;
  prompt += `- Relationship type: ${spec.relationship_type.replace(/_/g, ' ')}\n`;
  prompt += `- Current state: ${spec.relationship_state.replace(/_/g, ' ')}\n`;
  prompt += `- Communication goal: ${spec.relationship_goal.replace(/_/g, ' ')}\n`;
  if (spec.recipient_context) {
    prompt += `- Recipient context: ${spec.recipient_context}\n`;
  }

  prompt += `\nUNKNOWN: Any specific event, meal, visit, trip, conversation, gift, activity, or recent experience NOT listed in KNOWN FACTS above is UNKNOWN and must NOT be invented or referenced.\n`;

  prompt += `\nDelivery time context:\n`;
  prompt += `- Daypart: ${spec.timing_daypart}\n`;
  prompt += `- Timezone: ${spec.timezone}\n`;

  prompt += `\nTiming rules:\n`;
  prompt += `- This message will be delivered in the ${spec.timing_daypart}.\n`;
  prompt += `- ONLY use greetings appropriate for the ${spec.timing_daypart}: ${allowedGreetings.join(', ')}.\n`;
  prompt += `- Do NOT use greetings for other times of day.\n`;
  prompt += `- If you mention the time of day, it MUST be "${spec.timing_daypart}".\n`;

  if (spec.safety_constraints && spec.safety_constraints.length > 0) {
    prompt += `\nSafety and boundary constraints (must be respected):\n`;
    for (const c of spec.safety_constraints) {
      prompt += `- ${c}\n`;
    }
  }

  if (spec.learned_plan_preferences && spec.learned_plan_preferences.length > 0) {
    prompt += `\nLearned preferences for this communication plan: ${spec.learned_plan_preferences.join(', ')}\n`;
  }

  if (spec.recipient_specific_preferences && spec.recipient_specific_preferences.length > 0) {
    prompt += `\nRecipient-specific preferences: ${spec.recipient_specific_preferences.join(', ')}\n`;
  }

  if (recentMessages.length > 0) {
    prompt += `\nAvoid repeating these previously sent messages — do not reuse their openings, themes, or phrases:\n`;
    prompt += recentMessages.map(m => `- "${m.substring(0, 200)}"`).join('\n');
    prompt += '\n';
  }

  // Factual grounding — anti-fabrication (RC16)
  prompt += `\nFactual grounding rules (CRITICAL — must follow):\n`;
  prompt += `- ONLY reference a specific event, meal, visit, trip, conversation, gift, activity, or recent experience if it is explicitly stated in the context or relationship memory above.\n`;
  prompt += `- Do NOT invent or assume any personal event, experience, date, milestone, or circumstance that is not provided.\n`;
  prompt += `- Do NOT reference "last night", "yesterday", "recently", or any specific occasion unless it is in the provided context.\n`;
  prompt += `- Do NOT attribute feelings, thoughts, or statements to the recipient. Do NOT invent things they supposedly said or that you supposedly did.\n`;
  prompt += `- Relationship type, state, goal, strategy, and tone guide HOW to write — they must NOT be turned into invented specific events.\n`;
  prompt += `- When no specific facts are available, write a naturally warm, genuine message that does NOT pretend any specific event occurred.\n`;

  prompt += `\nStrictly prohibited:\n`;
  prompt += `- Never mention AI, models, prompts, providers, or machine learning\n`;
  prompt += `- Never sound robotic, automated, or like a template\n`;
  prompt += `- Never start with "Here is" or "Certainly" or "I hope this helps"\n`;
  prompt += `- Never use phrases like "as an AI" or "I am a language model"\n`;

  prompt += `\nQuality rules:\n`;
  prompt += `- Sound completely human and natural\n`;
  prompt += `- Express the "${getIntentDisplayLabel(spec.message_intent)}" intent genuinely and naturally\n`;
  prompt += `- Match the ${spec.tone} tone perfectly\n`;
  prompt += `- Be unique and heartfelt; do not sound generic\n`;
  prompt += `- Generate the final communication directly in ${spec.language_locale} — do NOT write in English first and then translate\n`;
  prompt += `- Return ONLY the message text, nothing else. No quotes, no labels, no explanations.\n`;

  return prompt;
}