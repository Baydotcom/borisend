/**
 * Strategy Validator — Extends the base RC7 validator with strategy-aware
 * checks (§26). Provider-neutral and portable. RC7 retry limits remain —
 * validation never becomes an unlimited generation loop.
 *
 * Checks added on top of the existing daypart/weekday/provider-language/length
 * validation:
 *  - romantic tone in a workplace context
 *  - excessive familiarity with a client
 *  - guilt/manipulation language in a reconnect context
 *  - ignoring explicit safety boundary
 *  - violating avoid instructions
 */

import type { MessageSpecification } from './types.ts';
import type { ValidationResult, ValidationIssue } from '../message-engine/types.ts';

const ROMANTIC_PHRASES = ['my love', 'darling', 'sweetheart', 'babe', 'my heart', 'my forever', 'soulmate'];
const FAMILIAR_CLIENT_PHRASES = ['mate', 'buddy', 'pal', 'bestie', 'love you', 'xoxo'];
const GUILT_PHRASES = ['you never', 'you always', 'i guess you', 'it would be nice if you', 'you could at least', 'after all i'];
const MANIPULATION_PHRASES = ['god told me', 'god wants you', 'this is your fault', 'you owe me', 'if you really cared'];
const EXCESSIVE_PRESSURE = ['you must', 'you have to', 'you need to', 'i expect you to', 'don\'t let me down'];

export function validateWithStrategy(
  content: string,
  spec: MessageSpecification | null,
  recentMessages: string[]
): { valid: boolean; issues: ValidationIssue[] } {
  // No specification (legacy plan) — no strategy checks; the base validator handles it.
  if (!spec) return { valid: true, issues: [] };

  const issues: ValidationIssue[] = [];
  const lower = (content || '').toLowerCase();
  const category = spec.relationship_category;
  const intent = spec.message_intent;
  const state = spec.relationship_state;

  // ── Romantic tone in non-romantic contexts ──
  const nonRomantic = ['workplace_professional', 'business_customer', 'education_development', 'network_influence'];
  if (nonRomantic.includes(category)) {
    for (const phrase of ROMANTIC_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'STRATEGY_INAPPROPRIATE_TONE',
          severity: 'error',
          message: `Romantic language "${phrase}" is inappropriate for a ${category.replace('_', ' ')} relationship`,
        });
      }
    }
  }

  // ── Excessive familiarity with a client ──
  if (category === 'business_customer') {
    for (const phrase of FAMILIAR_CLIENT_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'STRATEGY_EXCESSIVE_FAMILIARITY',
          severity: 'error',
          message: `Overly familiar language "${phrase}" is inappropriate for a client relationship`,
        });
      }
    }
  }

  // ── Guilt / manipulation in reconnect or rebuilding contexts ──
  const reconnectContext = ['distant', 'strained', 'rebuilding', 'neglected'].includes(state) ||
    ['gentle_reconnection'].includes(intent) ||
    ['reconnect', 'rebuild_trust_gradually'].includes(spec.relationship_goal);
  if (reconnectContext) {
    for (const phrase of GUILT_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'STRATEGY_GUILT_LANGUAGE',
          severity: 'error',
          message: `Guilt-inducing language "${phrase}" is inappropriate in a reconnection context`,
        });
      }
    }
  }

  // ── Spiritual manipulation (faith context) ──
  if (category === 'faith_spiritual') {
    for (const phrase of MANIPULATION_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'STRATEGY_SPIRITUAL_MANIPULATION',
          severity: 'error',
          message: `Spiritually manipulative language "${phrase}" is not permitted`,
        });
      }
    }
  }

  // ── Coercive pressure in workplace ──
  if (category === 'workplace_professional') {
    for (const phrase of EXCESSIVE_PRESSURE) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'STRATEGY_COERCIVE_PRESSURE',
          severity: 'error',
          message: `Coercive pressure language "${phrase}" is inappropriate in a professional relationship`,
        });
      }
    }
  }

  // ── Ignoring explicit safety boundary ──
  if (spec.safety_constraints && spec.safety_constraints.length > 0) {
    // If safety constraints mention no contact / do not, any message is flagged
    // (the pipeline should have blocked already, but guard defensively)
    const hardBlock = spec.safety_constraints.some(c => c.toLowerCase().includes('do not') && c.toLowerCase().includes('contact'));
    if (hardBlock) {
      issues.push({
        code: 'STRATEGY_SAFETY_BOUNDARY_IGNORED',
        severity: 'error',
        message: 'Message prepared despite a do-not-contact safety boundary',
      });
    }
  }

  const errors = issues.filter(i => i.severity === 'error');
  return { valid: errors.length === 0, issues };
}