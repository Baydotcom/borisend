/**
 * Mobile Billing Configuration
 *
 * Single source of truth for platform-aware billing behaviour.
 * Used by Subscription page, trial modals, and banners to suppress
 * Stripe checkout / payment-element rendering inside packaged mobile apps.
 *
 * Web and PWA → full Stripe billing (unchanged)
 * Packaged Android / iOS → no in-app Stripe purchasing or card collection
 */

import PlatformService from "@/services/mobile/PlatformService";

/** Web app URL for subscription management (shown to mobile users) */
export const WEB_APP_SUBSCRIPTION_URL = "https://app.borisend.macpeniel.com/subscription";

/**
 * True when running inside a packaged Android or iOS app (Capacitor native).
 * PWA and ordinary browser return false — Stripe billing stays fully active.
 */
export function isMobileBillingRestricted() {
  // Base44's generated store wrapper loads the app from its Base44 hostname,
  // while ordinary web users use the verified custom domain. Treat the
  // packaged Base44 host as store-app mode so billing is deterministic and
  // does not depend on native bridge detection.
  const hostname = typeof window !== "undefined" ? window.location?.hostname?.toLowerCase() : "";
  const isBase44StoreHost = hostname === "borisend-smart-connect.base44.app";

  return isBase44StoreHost || PlatformService.isAndroid() || PlatformService.isIOS();
}

/**
 * Returns a client platform tag sent to backend functions as `client_platform`.
 * Backend functions use this to reject Stripe-related requests from mobile apps
 * (defense-in-depth — primary control is the frontend not initiating the call).
 */
export function getPlatformClientTag() {
  if (PlatformService.isAndroid()) return "android";
  if (PlatformService.isIOS()) return "ios";
  if (PlatformService.isPWA()) return "pwa";
  return "web";
}