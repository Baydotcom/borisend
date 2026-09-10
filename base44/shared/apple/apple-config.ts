/**
 * RC20.3 — Apple IAP Configuration
 *
 * Central, provider-neutral configuration for Apple In-App Purchase
 * auto-renewable subscriptions.
 *
 * PRODUCT IDs:
 *   DEVELOPER ACTION REQUIRED. The actual App Store Connect product IDs
 *   must be supplied as environment variables (APPLE_IAP_MONTHLY_PRODUCT_ID
 *   and APPLE_IAP_ANNUAL_PRODUCT_ID) once the auto-renewable subscription
 *   group and products are created in App Store Connect.
 *
 *   Until supplied, ALLOWED_APPLE_PRODUCT_IDS is empty and the server
 *   verification will reject all Apple transactions with a clear error.
 *
 * BUNDLE ID:
 *   The canonical BoriSend bundle ID. All verified Apple transactions
 *   must reference this bundle ID.
 *
 * SERVER API CREDENTIALS (server-side only):
 *   APPLE_ISSUER_ID     — App Store Server API issuer ID
 *   APPLE_KEY_ID        — App Store Server API key ID
 *   APPLE_PRIVATE_KEY    — App Store Server API private key (PEM)
 *   APPLE_ROOT_CA_G3_PEM — Apple Root CA G3 certificate (PEM, optional but
 *                          recommended for full certificate-chain pinning)
 *
 *   DEVELOPER ACTION REQUIRED: Configure these in Settings → Secrets.
 *   Never put private key material in client code.
 */

export const APPLE_BUNDLE_ID = 'com.base6a3f3ae0473f4e5dce013c32.app';

/**
 * App Store Server API credentials (server-side only).
 * DEVELOPER ACTION REQUIRED: Set these in Settings → Secrets.
 *
 * Used for future App Store Server API operations (e.g. asking Apple for
 * transaction history, refund lookup, or subscription status queries).
 * Currently NOT invoked by any backend function (RC20.3.1 §6).
 * Documented here for future server API operations.
 *
 * These credentials are NEVER sent to client code.
 */
export const APPLE_ISSUER_ID: string =
  (typeof Deno !== 'undefined' && Deno.env?.get('APPLE_ISSUER_ID')) || '';
export const APPLE_KEY_ID: string =
  (typeof Deno !== 'undefined' && Deno.env?.get('APPLE_KEY_ID')) || '';
export const APPLE_PRIVATE_KEY: string =
  (typeof Deno !== 'undefined' && Deno.env?.get('APPLE_PRIVATE_KEY')) || '';

/** True when all App Store Server API credentials are configured. */
export function appleServerApiConfigured(): boolean {
  return !!(APPLE_ISSUER_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY);
}

/** True when the trusted Apple Root CA G3 certificate is configured. */
export function appleRootCaConfigured(): boolean {
  return !!(typeof Deno !== 'undefined' && Deno.env?.get('APPLE_ROOT_CA_G3_PEM'));
}

/**
 * DEVELOPER ACTION REQUIRED:
 * Set these environment variables to the actual App Store Connect
 * auto-renewable subscription product IDs once created.
 */
export const APPLE_IAP_MONTHLY_PRODUCT_ID: string =
  (typeof Deno !== 'undefined' && Deno.env?.get('APPLE_IAP_MONTHLY_PRODUCT_ID')) || '';
export const APPLE_IAP_ANNUAL_PRODUCT_ID: string =
  (typeof Deno !== 'undefined' && Deno.env?.get('APPLE_IAP_ANNUAL_PRODUCT_ID')) || '';

/**
 * The set of Apple product IDs that the server will accept.
 * Empty until the developer configures the real product IDs.
 */
export const ALLOWED_APPLE_PRODUCT_IDS: Set<string> = new Set(
  [APPLE_IAP_MONTHLY_PRODUCT_ID, APPLE_IAP_ANNUAL_PRODUCT_ID].filter(Boolean),
);

/** True when the developer has configured at least one Apple product ID. */
export function appleProductsConfigured(): boolean {
  return ALLOWED_APPLE_PRODUCT_IDS.size > 0;
}

/** Reject unknown product IDs. */
export function isAllowedAppleProduct(productId: string): boolean {
  if (!productId) return false;
  return ALLOWED_APPLE_PRODUCT_IDS.has(productId);
}

/** Map an Apple product ID to the BoriSend billing interval. */
export function getBillingIntervalForAppleProduct(productId: string): 'monthly' | 'annual' | null {
  if (productId === APPLE_IAP_MONTHLY_PRODUCT_ID && APPLE_IAP_MONTHLY_PRODUCT_ID) return 'monthly';
  if (productId === APPLE_IAP_ANNUAL_PRODUCT_ID && APPLE_IAP_ANNUAL_PRODUCT_ID) return 'annual';
  return null;
}

/** BoriSend canonical membership entitlements (identical for Stripe and Apple). */
export const BORISEND_MEMBERSHIP_ALLOWANCES = {
  included_plan_units: 3,
  included_recipient_units: 10,
  included_message_units: 20,
  included_message_passes: 5,
  included_smart_message_units: 30,
} as const;