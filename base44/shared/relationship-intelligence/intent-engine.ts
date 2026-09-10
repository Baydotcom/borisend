/**
 * Intent Engine — Selects the next communication intent (§11, §12).
 * Deterministic, provider-neutral. Considers recent message history to avoid
 * unnecessary repetition BEFORE any LLM invocation.
 *
 * Rules:
 *  1. If the last 3 messages used the same intent, prefer a different permitted intent.
 *  2. Otherwise, prefer the least-recently-used permitted intent.
 *  3. Never force variety when only one intent is permitted.
 */

import type { RelationshipStrategy } from './types.ts';

export function selectIntent(
  allowedIntents: string[],
  recentIntents: string[]
): string {
  if (allowedIntents.length === 0) return 'check_in';
  if (allowedIntents.length === 1) return allowedIntents[0];

  // Rule 1: if last 3 all the same intent, avoid it
  const lastThree = recentIntents.slice(-3);
  if (lastThree.length === 3 && lastThree.every(i => i === lastThree[0])) {
    const toAvoid = lastThree[0];
    const alternatives = allowedIntents.filter(i => i !== toAvoid);
    if (alternatives.length > 0) {
      return pickLeastRecentlyUsed(alternatives, recentIntents);
    }
  }

  // Rule 2: prefer least recently used
  return pickLeastRecentlyUsed(allowedIntents, recentIntents);
}

/**
 * Returns the intent whose most recent use is furthest in the past.
 * Intents never used are preferred (sort first). recentIntents is oldest→newest.
 */
function pickLeastRecentlyUsed(allowed: string[], recentIntents: string[]): string {
  const lastUsedIndex: Record<string, number> = {};
  for (let i = 0; i < recentIntents.length; i++) {
    lastUsedIndex[recentIntents[i]] = i; // later index = more recent
  }
  const sorted = [...allowed].sort((a, b) => {
    const aIdx = a in lastUsedIndex ? lastUsedIndex[a] : -1;
    const bIdx = b in lastUsedIndex ? lastUsedIndex[b] : -1;
    return aIdx - bIdx; // -1 (never used) sorts first; smaller index = older = preferred
  });
  return sorted[0];
}

/**
 * Returns a rotation plan: the selected intent plus any intents to avoid
 * because of recent over-use.
 */
export function getIntentRotationGuidance(
  strategy: RelationshipStrategy,
  recentIntents: string[]
): { selected: string; avoid_due_to_repetition: string[] } {
  const selected = selectIntent(strategy.allowed_message_intents, recentIntents);
  const avoid: string[] = [];
  const lastThree = recentIntents.slice(-3);
  if (lastThree.length === 3 && lastThree.every(i => i === lastThree[0])) {
    avoid.push(lastThree[0]);
  }
  return { selected, avoid_due_to_repetition: avoid };
}