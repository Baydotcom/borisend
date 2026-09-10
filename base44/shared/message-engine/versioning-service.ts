/**
 * Versioning Service — manages original and alternative message versions.
 * Portable: pure logic, no entity access.
 */

import { GenerationLimits } from "./generation-config.ts";
import { ReusableMessage, hasOriginalVersion, hasAlternativeVersion, countActiveVersions } from "./reuse-service.ts";

export interface VersionCheckResult {
  allowed: boolean;
  version_type: "original" | "alternative" | null;
  version_number: number;
  reason?: string;
}

/**
 * Determine what version type can be generated next.
 * Returns null if no more versions are allowed.
 */
export function getNextVersionType(
  messages: ReusableMessage[],
  generationKey: string,
  limits: GenerationLimits
): VersionCheckResult {
  const hasOriginal = hasOriginalVersion(messages, generationKey);
  const hasAlt = hasAlternativeVersion(messages, generationKey);
  const activeCount = countActiveVersions(messages, generationKey);

  if (!hasOriginal) {
    return { allowed: true, version_type: "original", version_number: 1 };
  }

  if (hasOriginal && !hasAlt && activeCount < limits.max_alternatives_per_occurrence + 1) {
    return { allowed: true, version_type: "alternative", version_number: 2 };
  }

  return {
    allowed: false,
    version_type: null,
    version_number: activeCount + 1,
    reason: "You already have two prepared versions for this scheduled message. You can edit either version or choose one to send.",
  };
}

/**
 * Check if an improvement request is allowed.
 * Improvements count as the one permitted alternative.
 */
export function canImprove(
  messages: ReusableMessage[],
  generationKey: string,
  limits: GenerationLimits
): boolean {
  const hasOriginal = hasOriginalVersion(messages, generationKey);
  const hasAlt = hasAlternativeVersion(messages, generationKey);
  return hasOriginal && !hasAlt;
}

/**
 * Mark one version as selected and others as not selected.
 * Returns the IDs to update (selected=true) and (selected=false).
 */
export function selectVersion(
  messages: ReusableMessage[],
  generationKey: string,
  selectedId: string
): { toSelect: string; toDeselect: string[] } {
  const versions = messages.filter((m) => m.generation_key === generationKey && !m.expired_at);
  const toDeselect = versions.filter((m) => m.id !== selectedId).map((m) => m.id);
  return { toSelect: selectedId, toDeselect };
}