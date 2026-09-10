/**
 * Reuse Service — checks for existing prepared messages before calling the provider.
 * Portable: operates on plain message arrays, no entity access.
 */

export interface ReusableMessage {
  id: string;
  generation_key: string;
  status: string;
  version_number: number;
  version_type: string;
  expired_at: string | null;
  content: string;
  edited_content?: string;
}

/**
 * Find a reusable prepared message for a GenerationKey.
 * A message is reusable if:
 * - It matches the generation_key
 * - It is not expired
 * - It is in a prepared/pending state (not sent, not failed, not cancelled)
 */
export function findReusableVersion(
  messages: ReusableMessage[],
  generationKey: string
): ReusableMessage | null {
  return (
    messages.find(
      (m) =>
        m.generation_key === generationKey &&
        !m.expired_at &&
        ["pending", "approved"].includes(m.status)
    ) || null
  );
}

/**
 * Check if an original version exists for a GenerationKey.
 */
export function hasOriginalVersion(
  messages: ReusableMessage[],
  generationKey: string
): boolean {
  return messages.some(
    (m) =>
      m.generation_key === generationKey &&
      !m.expired_at &&
      m.version_type === "original"
  );
}

/**
 * Check if an alternative version exists for a GenerationKey.
 */
export function hasAlternativeVersion(
  messages: ReusableMessage[],
  generationKey: string
): boolean {
  return messages.some(
    (m) =>
      m.generation_key === generationKey &&
      !m.expired_at &&
      (m.version_type === "alternative" || m.version_type === "improvement")
  );
}

/**
 * Count non-expired versions for a GenerationKey.
 */
export function countActiveVersions(
  messages: ReusableMessage[],
  generationKey: string
): number {
  return messages.filter(
    (m) => m.generation_key === generationKey && !m.expired_at
  ).length;
}

/**
 * Get all active (non-expired) versions for a GenerationKey, sorted by version number.
 */
export function getActiveVersions(
  messages: ReusableMessage[],
  generationKey: string
): ReusableMessage[] {
  return messages
    .filter((m) => m.generation_key === generationKey && !m.expired_at)
    .sort((a, b) => (a.version_number || 1) - (b.version_number || 1));
}