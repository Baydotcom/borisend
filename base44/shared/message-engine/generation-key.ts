/**
 * GenerationKey — provider-independent generation identity.
 * Portable: pure string manipulation, no platform dependencies.
 *
 * Format: user_id|campaign_id|recipient_id|scheduled_occurrence
 * Example: USR001|PLAN204|RECIPIENT55|2026-08-07T09:00:00Z
 */

export interface GenerationKeyParts {
  user_id: string;
  campaign_id: string;
  recipient_id: string;
  occurrence: string;
}

/**
 * Build a GenerationKey from its components.
 * The occurrence must be an ISO-8601 UTC timestamp (the intended delivery time).
 */
export function buildGenerationKey(parts: GenerationKeyParts): string {
  if (!parts.user_id || !parts.campaign_id || !parts.recipient_id || !parts.occurrence) {
    throw new Error("GenerationKey requires user_id, campaign_id, recipient_id, and occurrence");
  }
  return [parts.user_id, parts.campaign_id, parts.recipient_id, parts.occurrence].join("|");
}

/**
 * Parse a GenerationKey back into its components.
 */
export function parseGenerationKey(key: string): GenerationKeyParts {
  const parts = key.split("|");
  if (parts.length < 4) throw new Error("Invalid GenerationKey format");
  return {
    user_id: parts[0],
    campaign_id: parts[1],
    recipient_id: parts[2],
    occurrence: parts.slice(3).join("|"),
  };
}

/**
 * Derive a stable recipient_id from a recipient object.
 * Uses phone (most stable) or name as fallback.
 */
export function deriveRecipientId(recipient: { name?: string; phone?: string }): string {
  const id = (recipient.phone || recipient.name || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!id) throw new Error("Recipient must have a name or phone for GenerationKey");
  return `R_${id}`;
}

/**
 * Normalize an occurrence timestamp to seconds precision for stable key matching.
 * Truncates to the nearest second to avoid millisecond mismatches.
 */
export function normalizeOccurrence(occurrence: string | Date): string {
  const d = typeof occurrence === "string" ? new Date(occurrence) : occurrence;
  if (isNaN(d.getTime())) throw new Error("Invalid occurrence date");
  // Truncate to seconds for stable matching
  d.setMilliseconds(0);
  return d.toISOString();
}