/**
 * Memory Selector — Selects only relevant active RelationshipMemory for a
 * PlanRecipient (§23). Does NOT dump all memory blindly. PlanRecipient-scoped.
 * Boundary memories are excluded here (they feed the Safety Engine instead).
 * Feedback-derived memories feed preference resolution, not message content.
 */

import type { MemoryItem, IntelligenceInput } from './types.ts';

// Which memory types are relevant per intent
const INTENT_MEMORY_MAP: Record<string, string[]> = {
  milestone: ['important_date', 'milestone'],
  congratulations: ['important_date', 'milestone'],
  celebration: ['important_date', 'milestone'],
  shared_memory: ['milestone', 'fact'],
  gentle_reconnection: ['milestone', 'fact'],
  appreciation: ['fact', 'milestone'],
  check_in: ['fact', 'preference'],
  thoughtful_question: ['fact', 'preference'],
  encouragement: ['milestone', 'fact'],
  gratitude: ['fact', 'milestone'],
  practical_support: ['preference', 'fact'],
  development_support: ['preference', 'fact'],
  pastoral_encouragement: ['fact', 'milestone'],
  client_check_in: ['fact', 'preference'],
  relationship_maintenance: ['fact', 'preference'],
};

const DEFAULT_RELEVANT_TYPES = ['fact', 'preference'];
const MAX_MEMORIES = 3;

export function selectRelevantMemories(
  memories: MemoryItem[],
  intent: string
): MemoryItem[] {
  const active = memories.filter(m => m.is_active && m.memory_type !== 'boundary' && m.memory_type !== 'feedback_derived');
  if (active.length === 0) return [];

  const relevantTypes = INTENT_MEMORY_MAP[intent] || DEFAULT_RELEVANT_TYPES;
  const byType: Record<string, MemoryItem[]> = {};
  for (const m of active) {
    (byType[m.memory_type] ||= []).push(m);
  }

  const result: MemoryItem[] = [];
  for (const t of relevantTypes) {
    if (byType[t]) {
      for (const m of byType[t]) {
        if (result.length >= MAX_MEMORIES) break;
        result.push(m);
      }
    }
    if (result.length >= MAX_MEMORIES) break;
  }

  return result;
}

/**
 * Check for an imminent important date (within ±7 days of a reference date).
 * Returns the memory if one is close enough to surface in the message.
 */
export function findImminentImportantDate(
  memories: MemoryItem[],
  referenceDate: string
): MemoryItem | null {
  const ref = new Date(referenceDate);
  const activeDates = memories.filter(m => m.is_active && m.memory_type === 'important_date' && m.related_date);
  for (const m of activeDates) {
    try {
      const d = new Date(m.related_date!);
      const diffDays = Math.abs((d.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) return m;
    } catch { /* skip invalid date */ }
  }
  return null;
}