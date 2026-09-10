/**
 * Strategy-Aware Fallback Builder — Template/rule-driven fallback that
 * respects relationship type, intent, tone, safety, and timing (§27).
 * No LLM cost. Used when provider output fails validation and correction fails.
 */

import type { MessageSpecification } from './types.ts';

const TIME_NEUTRAL_GREETINGS = ['Hi', 'Hey', 'Hello'];

export function buildStrategyFallbackMessage(
  spec: MessageSpecification,
  recipientName: string
): string {
  const name = recipientName || 'there';
  const intent = spec.message_intent;
  const category = spec.relationship_category;
  const tone = spec.tone;
  const greeting = TIME_NEUTRAL_GREETINGS[Math.floor(Math.random() * TIME_NEUTRAL_GREETINGS.length)];

  // Safety: never produce reconnection content for DO_NOT_ENCOURAGE_CONTACT
  // (the pipeline blocks before this, but guard defensively)
  if (spec.safety_constraints.some(c => c.toLowerCase().includes('no contact') || c.toLowerCase().includes('do not'))) {
    return `${greeting} ${name}, thinking of you and wishing you well.`;
  }

  // Intent-driven templates, respecting category family
  const templates = pickTemplates(intent, category, tone, name, greeting, spec);
  return templates[Math.floor(Math.random() * templates.length)];
}

function pickTemplates(
  intent: string,
  category: string,
  tone: string,
  name: string,
  greeting: string,
  spec: MessageSpecification
): string[] {
  // Reconnect / distant contexts: gentle, non-demanding
  const isReconnect = ['gentle_reconnection'].includes(intent) ||
    ['distant', 'strained', 'rebuilding', 'neglected'].includes(spec.relationship_state);
  if (isReconnect) {
    return [
      `${greeting} ${name}, you crossed my mind and I wanted to reach out. No need to reply — just sending good wishes your way.`,
      `${greeting} ${name}, thinking of you and hoping you're doing well. Wishing you a good day.`,
      `${greeting} ${name}, just wanted to say I was thinking of you. Hope everything's going well on your end.`,
    ];
  }

  // Intent-specific
  switch (intent) {
    case 'appreciation':
      return [
        `${greeting} ${name}, just wanted to say I appreciate you and all you do. Hope you're having a good day.`,
        `${greeting} ${name}, a quick note to say thank you for being you. It doesn't go unnoticed.`,
      ];
    case 'encouragement':
      return [
        `${greeting} ${name}, just a reminder that you're doing great. Keep going — I'm rooting for you.`,
        `${greeting} ${name}, thinking of you and wanted to send some encouragement your way today.`,
      ];
    case 'recognition':
      return [
        `${greeting} ${name}, wanted to recognise the effort you've been putting in lately. It's genuinely appreciated.`,
        `${greeting} ${name}, just a note to acknowledge your recent contribution. Thank you for the great work.`,
      ];
    case 'gratitude':
      return [
        `${greeting} ${name}, wanted to say a proper thank you for what you did. I'm grateful for it.`,
        `${greeting} ${name}, just a note to say thank you. It meant a lot.`,
      ];
    case 'celebration':
    case 'congratulations':
      return [
        `${greeting} ${name}, congratulations! Really pleased for you and wanted to send my best wishes.`,
        `${greeting} ${name}, just wanted to celebrate this moment with you. Well done.`,
      ];
    case 'milestone':
      return [
        `${greeting} ${name}, thinking of this milestone and wanted to mark it with you. Hope it's a good one.`,
        `${greeting} ${name}, just a note to acknowledge this occasion. Wishing you the very best.`,
      ];
    case 'shared_memory':
      return [
        `${greeting} ${name}, something reminded me of a memory we share and it made me smile. Hope you're doing well.`,
        `${greeting} ${name}, a memory of us crossed my mind today. Just wanted to reach out and say hello.`,
      ];
    case 'gentle_reconnection':
      return [
        `${greeting} ${name}, it's been a while and you crossed my mind. No need to reply — just sending warm wishes.`,
        `${greeting} ${name}, thinking of you and hoping you're well. Just wanted to reach out.`,
      ];
    case 'practical_support':
      return [
        `${greeting} ${name}, just checking in — let me know if there's anything I can help with. No pressure at all.`,
        `${greeting} ${name}, thinking of you. If there's anything you need, I'm here.`,
      ];
    case 'thoughtful_question':
      return [
        `${greeting} ${name}, just wondering how things are going with you? Hope all is well.`,
        `${greeting} ${name}, a quick check-in — how have you been? Thinking of you.`,
      ];
    case 'development_support':
      return [
        `${greeting} ${name}, just wanted to encourage you with what you're working on. You're making good progress.`,
        `${greeting} ${name}, thinking about your development and wanted to send some support your way.`,
      ];
    case 'pastoral_encouragement':
      return [
        `${greeting} ${name}, keeping you in my thoughts and prayers. Wishing you peace and strength today.`,
        `${greeting} ${name}, just wanted to send a note of care and encouragement your way.`,
      ];
    case 'client_check_in':
      return [
        `${greeting} ${name}, just checking in to see how things are going. Hope all is well on your side.`,
        `${greeting} ${name}, a quick note to check in — let me know if there's anything I can help with.`,
      ];
    case 'relationship_maintenance':
      return [
        `${greeting} ${name}, just reaching out to stay in touch. Hope you're doing well.`,
        `${greeting} ${name}, thinking of you and wanted to send a quick hello.`,
      ];
    case 'check_in':
    default:
      // Family-aware default
      if (category === 'romantic_marital') {
        return [
          `${greeting} ${name}, just thinking about you and wanted to send some love. Hope your day is going well.`,
          `${greeting} ${name}, you crossed my mind and I wanted to reach out. Missing you a little today.`,
        ];
      }
      if (category === 'business_customer') {
        return [
          `${greeting} ${name}, just checking in to see how things are. Hope everything's going well.`,
          `${greeting} ${name}, a quick note to stay in touch. Hope you're doing well.`,
        ];
      }
      return [
        `${greeting} ${name}, just thinking about you and wanted to reach out. Hope you're having a good day.`,
        `${greeting} ${name}, you crossed my mind and I wanted to say hello. Hope everything's going well.`,
      ];
  }
}