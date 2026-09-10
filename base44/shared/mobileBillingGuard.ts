/**
 * Mobile Billing Guard — Server-side defense-in-depth
 *
 * Rejects requests that originate from a packaged mobile app (Android/iOS).
 * The frontend sends `client_platform` in the request body.
 *
 * LIMITATION: This is a frontend-informed signal, not a cryptographically
 * verified server-side platform check. Base44 serverless functions do not
 * have access to native platform attestation APIs. This guard prevents the
 * app's own UI from initiating Stripe flows on mobile; it is not a security
 * boundary against determined API abuse.
 *
 * Usage:
 *   const body = await req.json();
 *   const blocked = checkMobileBillingBlocked(body);
 *   if (blocked) return blocked;
 */
export function checkMobileBillingBlocked(body) {
  const clientPlatform = body?.client_platform;
  if (clientPlatform === "android" || clientPlatform === "ios") {
    return Response.json(
      {
        error:
          "In-app purchases are not available in the packaged mobile app. Please manage your subscription through the BoriSend web application.",
        mobile_billing_blocked: true,
      },
      { status: 403 }
    );
  }
  return null;
}