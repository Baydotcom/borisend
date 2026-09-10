/**
 * Intent Library — Configurable communication intent definitions (§11).
 * Provider-neutral and portable. Not every intent is available for every
 * strategy — the strategy's allowed_message_intents determines availability.
 */

import type { CommunicationIntent } from './types.ts';

export const INTENT_LIBRARY: CommunicationIntent[] = [
  { intent_key: 'check_in', display_label: 'Check-in', description: 'A gentle check-in to see how they are doing.', applicable_families: ['*'] },
  { intent_key: 'appreciation', display_label: 'Appreciation', description: 'Express appreciation for who they are or what they do.', applicable_families: ['*'] },
  { intent_key: 'encouragement', display_label: 'Encouragement', description: 'Offer encouragement and support.', applicable_families: ['*'] },
  { intent_key: 'recognition', display_label: 'Recognition', description: 'Recognise a specific contribution or achievement.', applicable_families: ['workplace_professional', 'education_development'] },
  { intent_key: 'gratitude', display_label: 'Gratitude', description: 'Express gratitude for something specific.', applicable_families: ['romantic_marital', 'friendship_personal', 'business_customer'] },
  { intent_key: 'celebration', display_label: 'Celebration', description: 'Celebrate a moment or occasion.', applicable_families: ['*'] },
  { intent_key: 'shared_memory', display_label: 'Shared Memory', description: 'Recall a shared experience or memory.', applicable_families: ['romantic_marital', 'parent_child', 'family_extended', 'friendship_personal', 'faith_spiritual', 'network_influence'] },
  { intent_key: 'practical_support', display_label: 'Practical Support', description: 'Offer practical support or help.', applicable_families: ['parent_child', 'care_support', 'friendship_personal'] },
  { intent_key: 'thoughtful_question', display_label: 'Thoughtful Question', description: 'Ask a genuine, thoughtful question about their life.', applicable_families: ['*'] },
  { intent_key: 'milestone', display_label: 'Milestone', description: 'Acknowledge a milestone or important date.', applicable_families: ['*'] },
  { intent_key: 'congratulations', display_label: 'Congratulations', description: 'Congratulate them on an achievement.', applicable_families: ['romantic_marital', 'parent_child', 'workplace_professional', 'education_development', 'friendship_personal'] },
  { intent_key: 'gentle_reconnection', display_label: 'Gentle Reconnection', description: 'A low-pressure reconnection after distance.', applicable_families: ['parent_child', 'family_extended', 'friendship_personal'] },
  { intent_key: 'development_support', display_label: 'Development Support', description: 'Support their development or growth.', applicable_families: ['workplace_professional', 'education_development'] },
  { intent_key: 'pastoral_encouragement', display_label: 'Pastoral Encouragement', description: 'Faith-sensitive pastoral encouragement and care.', applicable_families: ['faith_spiritual'] },
  { intent_key: 'client_check_in', display_label: 'Client Check-in', description: 'A professional client check-in focused on value.', applicable_families: ['business_customer'] },
  { intent_key: 'relationship_maintenance', display_label: 'Relationship Maintenance', description: 'General maintenance of the connection.', applicable_families: ['*'] },
];

const INTENT_MAP: Record<string, CommunicationIntent> = INTENT_LIBRARY.reduce(
  (acc, i) => { acc[i.intent_key] = i; return acc; },
  {} as Record<string, CommunicationIntent>
);

export function getIntent(intentKey: string): CommunicationIntent | undefined {
  return INTENT_MAP[intentKey];
}

export function getIntentDisplayLabel(intentKey: string): string {
  return INTENT_MAP[intentKey]?.display_label || intentKey;
}