/**
 * Metrics Service — portable cost and quality metrics.
 * Computes aggregate metrics from ledger entries and message records.
 * Never exposes provider names or costs to normal users.
 */

import { LedgerEntry } from "./usage-ledger-service.ts";

export interface GenerationMetrics {
  successful_provider_calls: number;
  failed_provider_calls: number;
  average_calls_per_successful_message: number;
  original_to_alternative_ratio: number;
  manual_edit_rate: number;
  message_selection_rate: number;
  unsent_prepared_message_rate: number;
  average_replacements_per_plan: number;
  provider_cost_per_plan: number;
  provider_cost_per_active_user: number;
  plans_with_repeated_dissatisfaction: number;
  plans_with_high_validation_failure_rates: number;
  estimated_savings_from_reuse: number;
  first_version_acceptance_rate: number;
  total_provider_units: number;
}

/**
 * Calculate metrics from ledger entries and message records.
 */
export function calculateMetrics(
  ledgerEntries: LedgerEntry[],
  messages: Array<{
    id: string;
    status: string;
    version_number: number;
    version_type: string;
    generation_type: string;
    is_selected: boolean;
    campaign_id: string;
    edited_content?: string;
    content: string;
  }>
): GenerationMetrics {
  const successful = ledgerEntries.filter((e) => e.status === "success");
  const failed = ledgerEntries.filter((e) => e.status === "failed");
  const originals = ledgerEntries.filter((e) => e.generation_type === "original" && e.status === "success");
  const alternatives = ledgerEntries.filter((e) => e.generation_type === "alternative" && e.status === "success");
  const improvements = ledgerEntries.filter((e) => e.generation_type === "improvement" && e.status === "success");
  const manualEdits = messages.filter((m) => m.edited_content && m.edited_content !== m.content);
  const selected = messages.filter((m) => m.is_selected);
  const unsent = messages.filter((m) => ["pending", "approved"].includes(m.status));
  const total = messages.length;

  const uniqueCampaigns = new Set(messages.map((m) => m.campaign_id)).size || 1;
  const uniqueUsers = new Set(ledgerEntries.map((e) => e.user_id)).size || 1;

  // First-version acceptance: how many messages were sent as version 1 without requesting an alternative
  const firstVersionAccepted = messages.filter(
    (m) => m.version_number === 1 && m.status === "sent"
  ).length;
  const firstVersionTotal = messages.filter((m) => m.version_number === 1).length || 1;

  // Estimated savings from reuse: each duplicate request that reused an existing message
  // saves 1 provider call. We estimate this as the difference between total requests and successful calls.
  const totalRequests = ledgerEntries.length;
  const estimatedSavingsFromReuse = Math.max(0, totalRequests - successful.length);

  return {
    successful_provider_calls: successful.length,
    failed_provider_calls: failed.length,
    average_calls_per_successful_message: successful.length > 0
      ? ledgerEntries.length / successful.length
      : 0,
    original_to_alternative_ratio: originals.length > 0
      ? (alternatives.length + improvements.length) / originals.length
      : 0,
    manual_edit_rate: total > 0 ? manualEdits.length / total : 0,
    message_selection_rate: total > 0 ? selected.length / total : 0,
    unsent_prepared_message_rate: total > 0 ? unsent.length / total : 0,
    average_replacements_per_plan: uniqueCampaigns > 0
      ? (alternatives.length + improvements.length) / uniqueCampaigns
      : 0,
    provider_cost_per_plan: uniqueCampaigns > 0
      ? successful.length / uniqueCampaigns
      : 0,
    provider_cost_per_active_user: uniqueUsers > 0
      ? successful.length / uniqueUsers
      : 0,
    plans_with_repeated_dissatisfaction: countPlansWithRepeatedDissatisfaction(ledgerEntries),
    plans_with_high_validation_failure_rates: countPlansWithValidationFailures(ledgerEntries),
    estimated_savings_from_reuse: estimatedSavingsFromReuse,
    first_version_acceptance_rate: firstVersionTotal > 0
      ? firstVersionAccepted / firstVersionTotal
      : 0,
    total_provider_units: ledgerEntries.reduce((sum, e) => sum + (e.provider_units || 0), 0),
  };
}

function countPlansWithRepeatedDissatisfaction(entries: LedgerEntry[]): number {
  const planAltCounts: Record<string, number> = {};
  for (const e of entries) {
    if (e.generation_type === "alternative" && e.status === "success") {
      planAltCounts[e.campaign_id] = (planAltCounts[e.campaign_id] || 0) + 1;
    }
  }
  return Object.values(planAltCounts).filter((c) => c >= 3).length;
}

function countPlansWithValidationFailures(entries: LedgerEntry[]): number {
  const planFailCounts: Record<string, number> = {};
  for (const e of entries) {
    if (e.validation_result && e.validation_result !== "valid" && e.status === "failed") {
      planFailCounts[e.campaign_id] = (planFailCounts[e.campaign_id] || 0) + 1;
    }
  }
  return Object.values(planFailCounts).filter((c) => c >= 3).length;
}