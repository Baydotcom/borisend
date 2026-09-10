/**
 * FailureClassifier — Classifies provider errors into provider-independent categories.
 * Determines whether a failure is temporary (retryable) or permanent.
 * Portable: no Base44 dependencies.
 */

import { FailureClassification, FailureCategory } from './types.ts';

export function classifyFailure(error: Error | string): FailureClassification {
  const message = typeof error === 'string' ? error : (error?.message || String(error));
  const lower = message.toLowerCase();

  // Invalid provider configuration — permanent
  if (lower.includes('api key not configured') || lower.includes('not configured') ||
      lower.includes('config_error') || lower.includes('invalid provider') ||
      lower.includes('subscription plan configuration')) {
    return { category: 'invalid_provider_config', is_permanent: true, should_retry: false };
  }

  // Invalid generation context — permanent
  if (lower.includes('campaign is required') || lower.includes('invalid_generation_context')) {
    return { category: 'invalid_generation_context', is_permanent: true, should_retry: false };
  }

  // Rate limit — temporary with backoff
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) {
    return { category: 'rate_limit', is_permanent: false, should_retry: true };
  }

  // Timeout — temporary
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { category: 'timeout', is_permanent: false, should_retry: true };
  }

  // Network failure — temporary
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch') ||
      lower.includes('connection')) {
    return { category: 'network_failure', is_permanent: false, should_retry: true };
  }

  // Invalid provider response — temporary (provider might recover)
  if (lower.includes('empty content') || lower.includes('invalid response') ||
      lower.includes('malformed') || lower.includes('returned empty')) {
    return { category: 'invalid_provider_response', is_permanent: false, should_retry: true };
  }

  // Content validation failure — not a provider failure, handled separately
  if (lower.includes('validation') || lower.includes('validation_failure')) {
    return { category: 'content_validation_failure', is_permanent: false, should_retry: false };
  }

  // Subscription/quota — permanent (for this cycle)
  if (lower.includes('quota') || lower.includes('subscription') || lower.includes('403') ||
      lower.includes('paused')) {
    return { category: 'invalid_provider_config', is_permanent: true, should_retry: false };
  }

  // Default — temporary, try once more
  return { category: 'temporary_failure', is_permanent: false, should_retry: true };
}

export function isPermanentFailure(classification: FailureClassification): boolean {
  return classification.is_permanent;
}

export function getFailureCategory(error: Error | string): FailureCategory {
  return classifyFailure(error).category;
}