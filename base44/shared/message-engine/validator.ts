/**
 * MessageValidator — Validates provider responses before saving as Message records.
 * Checks daypart, weekday, prohibited phrases, repetition, length, and provider language.
 * Portable: no Base44 dependencies.
 */

import { GenerationContext, ValidationResult, ValidationIssue } from './types.ts';
import { getProhibitedGreetings } from './time-context.ts';

const MORNING_PHRASES = ['good morning', 'this morning', 'start your day', 'have a lovely morning', 'rise and shine'];
const AFTERNOON_PHRASES = ['good afternoon', 'this afternoon'];
const EVENING_PHRASES = ['good evening', 'this evening'];
const NIGHT_PHRASES = ['good night', 'sleep well', 'sweet dreams', 'rest well', 'tonight'];

const PROVIDER_PHRASES = [
  'ai', 'artificial intelligence', 'as an ai', 'language model', 'i am a model',
  'i cannot', 'i apologize', 'here is your message', 'certainly',
  'i hope this helps', 'machine learning', 'prompt',
];

export function validateMessage(
  content: string,
  context: GenerationContext,
  recentMessages: string[]
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!content || !content.trim()) {
    issues.push({ code: 'EMPTY_CONTENT', severity: 'error', message: 'Content is empty' });
    return { valid: false, issues };
  }

  const trimmed = content.trim();
  const lower = trimmed.toLowerCase();
  const daypart = context.delivery.daypart;

  // ── Daypart checks ──
  if (daypart !== 'morning') {
    for (const phrase of MORNING_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'WRONG_DAYPART_MORNING',
          severity: 'error',
          message: `Contains morning wording "${phrase}" but delivery is ${daypart}`,
        });
      }
    }
  }

  if (daypart !== 'afternoon') {
    for (const phrase of AFTERNOON_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'WRONG_DAYPART_AFTERNOON',
          severity: 'error',
          message: `Contains afternoon wording "${phrase}" but delivery is ${daypart}`,
        });
      }
    }
  }

  if (daypart !== 'evening' && daypart !== 'night') {
    for (const phrase of EVENING_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'WRONG_DAYPART_EVENING',
          severity: 'error',
          message: `Contains evening wording "${phrase}" but delivery is ${daypart}`,
        });
      }
    }
  }

  if (daypart !== 'night') {
    for (const phrase of ['good night', 'sleep well', 'sweet dreams', 'rest well']) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'WRONG_DAYPART_NIGHT',
          severity: 'error',
          message: `Contains night wording "${phrase}" but delivery is ${daypart}`,
        });
      }
    }
  }

  // "tonight" is only valid in evening or night
  if (daypart !== 'evening' && daypart !== 'night') {
    if (lower.includes('tonight')) {
      issues.push({
        code: 'WRONG_DAYPART_TONIGHT',
        severity: 'error',
        message: 'Contains "tonight" but delivery is not evening or night',
      });
    }
  }

  // ── Weekday check ──
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const actualWeekday = context.delivery.weekday.toLowerCase();
  for (const wd of weekdays) {
    if (wd !== actualWeekday && lower.includes(wd)) {
      issues.push({
        code: 'WRONG_WEEKDAY',
        severity: 'error',
        message: `References "${wd}" but delivery day is ${context.delivery.weekday}`,
      });
    }
  }

  // ── Provider/AI language ──
  for (const phrase of PROVIDER_PHRASES) {
    if (lower.includes(phrase)) {
      issues.push({
        code: 'PROVIDER_LANGUAGE',
        severity: 'error',
        message: `Contains prohibited provider language: "${phrase}"`,
      });
    }
  }

  // ── Length checks ──
  if (trimmed.length < 10) {
    issues.push({ code: 'TOO_SHORT', severity: 'error', message: 'Message is too short' });
  }
  if (trimmed.length > 1000) {
    issues.push({ code: 'TOO_LONG', severity: 'warning', message: 'Message exceeds 1000 characters' });
  }

  // ── Repetition check ──
  if (recentMessages.length > 0) {
    const openingWords = trimmed.split(/\s+/).slice(0, 3).join(' ').toLowerCase();
    for (const recent of recentMessages) {
      const recentOpening = recent.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
      if (openingWords === recentOpening) {
        issues.push({
          code: 'REPETITIVE_OPENING',
          severity: 'error',
          message: 'Opening words match a recently sent message',
        });
        break;
      }
    }
  }

  // ── Malformed output check ──
  if (/^(message|sms|text|output|response)\s*:/i.test(trimmed)) {
    issues.push({ code: 'MALFORMED_PREFIX', severity: 'error', message: 'Contains label prefix' });
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 2) {
    issues.push({ code: 'QUOTED_OUTPUT', severity: 'warning', message: 'Output is wrapped in quotes' });
  }

  const errors = issues.filter(i => i.severity === 'error');
  return { valid: errors.length === 0, issues };
}