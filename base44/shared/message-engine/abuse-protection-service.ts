/**
 * Abuse Protection Service — detects unusual generation patterns.
 * Portable: pure logic. Entity access in backend function.
 *
 * Responses are non-hostile: temporary cooldown, reuse of prepared versions,
 * encouragement to edit manually, internal admin flag.
 */

import { GenerationLimits } from "./generation-config.ts";
import { LedgerEntry } from "./usage-ledger-service.ts";

export interface AbuseCheckResult {
  allowed: boolean;
  cooldownMs: number;
  reason: string;
  userMessage: string;
  shouldFlag: boolean;
}

/**
 * Check if a user's generation pattern suggests abuse.
 */
export function checkAbuse(params: {
  recentLedgerEntries: LedgerEntry[];
  recentAlternatives: number;
  recentFailures: number;
  totalPreparedNotSent: number;
  limits: GenerationLimits;
}): AbuseCheckResult {
  const { recentLedgerEntries, recentAlternatives, recentFailures, totalPreparedNotSent, limits } = params;

  // Check rapid-fire requests in the detection window
  const now = Date.now();
  const windowStart = now - limits.abuse_detection_window_ms;
  const recentInWindow = recentLedgerEntries.filter(
    (e) => new Date(e.started_at).getTime() > windowStart
  );

  if (recentInWindow.length >= limits.abuse_max_generations_in_window) {
    return {
      allowed: false,
      cooldownMs: limits.abuse_cooldown_ms,
      reason: "rate_limited",
      userMessage: "You are preparing messages quickly. Please wait a moment and try again.",
      shouldFlag: recentInWindow.length >= limits.abuse_max_generations_in_window * 2,
    };
  }

  // Check many alternatives without sending
  if (recentAlternatives >= 3 && totalPreparedNotSent >= 5) {
    return {
      allowed: false,
      cooldownMs: limits.abuse_cooldown_ms,
      reason: "excessive_alternatives",
      userMessage: "You have several prepared messages that have not been sent. Consider editing an existing version instead.",
      shouldFlag: true,
    };
  }

  // Check excessive failures
  if (recentFailures >= 10) {
    return {
      allowed: false,
      cooldownMs: limits.abuse_cooldown_ms * 2,
      reason: "excessive_failures",
      userMessage: "BoriSend is having difficulty preparing messages right now. Please try again later.",
      shouldFlag: true,
    };
  }

  return {
    allowed: true,
    cooldownMs: 0,
    reason: "ok",
    userMessage: "",
    shouldFlag: false,
  };
}