/**
 * Canonical phone normalization for BoriSend backend functions.
 * Frontend uses src/lib/phoneUtils.js (same logic, separate runtime).
 *
 * RC18.2 §16: ONE authoritative phone normalization utility.
 */
export function normalizePhone(phone: string, defaultCountryCode = "44"): string {
  if (!phone || typeof phone !== "string") return "";

  const trimmed = phone.trim();
  if (!trimmed) return "";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return "";

  if (hasPlus) {
    return "+" + digits;
  }

  if (digits.startsWith("00")) {
    return "+" + digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return "+" + defaultCountryCode + digits.slice(1);
  }

  return "+" + defaultCountryCode + digits;
}

export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\+\d{7,15}$/.test(normalized);
}