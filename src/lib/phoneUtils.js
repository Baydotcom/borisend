/**
 * Canonical phone normalization utility for BoriSend frontend.
 * Backend uses base44/shared/phone-utils.ts (same logic, separate runtime).
 *
 * Normalization rules:
 * - Strip all non-digit characters except leading +
 * - + prefix -> international, keep as-is
 * - 00 prefix -> replace with +
 * - 0 prefix (local) -> replace with + <defaultCountryCode>
 * - No prefix -> assume local, prepend + <defaultCountryCode>
 * - Empty/invalid -> empty string
 *
 * Default country code: 44 (UK) — app uses GBP, UK phone format.
 * RC18.2 §16/§17: Do not guess country codes from language.
 */
export function normalizePhone(phone, defaultCountryCode = "44") {
  if (!phone || typeof phone !== "string") return "";

  const trimmed = phone.trim();
  if (!trimmed) return "";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return "";

  // Already international with + prefix
  if (hasPlus) {
    return "+" + digits;
  }

  // 00 international prefix
  if (digits.startsWith("00")) {
    return "+" + digits.slice(2);
  }

  // Local number with leading 0
  if (digits.startsWith("0")) {
    return "+" + defaultCountryCode + digits.slice(1);
  }

  // No clear prefix — assume local
  return "+" + defaultCountryCode + digits;
}

/**
 * Get a display-friendly version of a phone number.
 * Preserves the original input format if available.
 */
export function getDisplayPhone(phone) {
  if (!phone) return "";
  return phone.trim();
}

/**
 * Check if a phone number looks valid (has enough digits after normalization).
 * E.164: + followed by 7-15 digits.
 */
export function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^\+\d{7,15}$/.test(normalized);
}