/**
 * Usage Ledger Service — provider-independent internal ledger for provider invocations.
 * Portable: pure logic for ledger entry construction and classification.
 */

export interface LedgerEntry {
  request_id: string;
  generation_key: string;
  user_id: string;
  campaign_id: string;
  recipient_id: string;
  scheduled_occurrence: string;
  message_id: string;
  version_number: number;
  generation_type: "original" | "alternative" | "improvement" | "technical_retry" | "validation_retry";
  provider_internal_name: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: "success" | "failed" | "retrying";
  failure_category: string;
  validation_result: string;
  provider_units: number;
  estimated_cost: number;
  feedback_reason: string;
}

/**
 * Create a ledger entry for a provider invocation.
 */
export function createLedgerEntry(params: {
  request_id: string;
  generation_key: string;
  user_id: string;
  campaign_id: string;
  recipient_id: string;
  scheduled_occurrence: string;
  message_id: string;
  version_number: number;
  generation_type: LedgerEntry["generation_type"];
  provider_internal_name: string;
  started_at: string;
  status: LedgerEntry["status"];
  failure_category?: string;
  validation_result?: string;
  feedback_reason?: string;
}): Omit<LedgerEntry, "completed_at" | "duration_ms" | "provider_units" | "estimated_cost"> & {
  completed_at: string;
  duration_ms: number;
  provider_units: number;
  estimated_cost: number;
} {
  const now = new Date();
  const startedAt = new Date(params.started_at);
  const duration_ms = now.getTime() - startedAt.getTime();

  return {
    ...params,
    completed_at: now.toISOString(),
    duration_ms,
    provider_units: 1, // Each provider call is 1 unit by default
    estimated_cost: params.status === "success" ? 1 : 0, // Only successful calls have cost
    failure_category: params.failure_category || "",
    validation_result: params.validation_result || "",
    feedback_reason: params.feedback_reason || "",
  };
}

/**
 * Check if a generation type counts as a user-requested provider call.
 * User-requested: original, alternative, improvement
 * Non-user-requested: technical_retry, validation_retry
 */
export function isUserRequested(type: string): boolean {
  return ["original", "alternative", "improvement"].includes(type);
}

/**
 * Check if a generation type is a technical/system retry.
 */
export function isSystemRetry(type: string): boolean {
  return ["technical_retry", "validation_retry"].includes(type);
}

/**
 * Check if a ledger entry should count toward the user's send allowance.
 * Technical failures and retries must NEVER reduce customer allowance.
 */
export function countsTowardAllowance(entry: LedgerEntry): boolean {
  // Only successful user-requested generations count
  return entry.status === "success" && isUserRequested(entry.generation_type);
}