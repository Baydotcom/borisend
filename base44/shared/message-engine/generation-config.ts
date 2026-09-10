/**
 * Generation Configuration — portable admin-controlled limits.
 * Reads from AppSettings entity (Base44) or environment variables (private server).
 *
 * This module is portable: it defines the config schema and defaults.
 * The actual reading of AppSettings is done by the backend function.
 */

export interface GenerationLimits {
  max_alternatives_per_occurrence: number;
  max_validation_retries: number;
  max_technical_retries: number;
  lock_timeout_ms: number;
  generation_timeout_ms: number;
  daily_user_generation_limit: number;
  daily_system_generation_limit: number;
  monthly_system_budget: number;
  message_expiry_hours: number;
  confidence_threshold: number;
  feedback_count_before_adapting: number;
  provider_pause_threshold: number;
  abuse_cooldown_ms: number;
  abuse_detection_window_ms: number;
  abuse_max_generations_in_window: number;
}

export const DEFAULT_LIMITS: GenerationLimits = {
  max_alternatives_per_occurrence: 1,
  max_validation_retries: 1,
  max_technical_retries: 1,
  lock_timeout_ms: 30000,
  generation_timeout_ms: 45000,
  daily_user_generation_limit: 50,
  daily_system_generation_limit: 2000,
  monthly_system_budget: 60000,
  message_expiry_hours: 48,
  confidence_threshold: 0.6,
  feedback_count_before_adapting: 3,
  provider_pause_threshold: 10,
  abuse_cooldown_ms: 60000,
  abuse_detection_window_ms: 60000,
  abuse_max_generations_in_window: 5,
};

/**
 * Merge defaults with AppSettings overrides.
 * The backend function passes settings as a flat key→value map.
 */
export function mergeLimits(
  defaults: GenerationLimits,
  overrides: Record<string, string>
): GenerationLimits {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const override = overrides[`generation_${key}`];
    if (override !== undefined && override !== null && override !== "") {
      const numVal = Number(override);
      if (!isNaN(numVal)) {
        (result as any)[key] = numVal;
      }
    }
  }
  return result;
}