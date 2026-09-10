import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { verifyAppleJWS } from '../../shared/apple/apple-jws.ts';
import {
  reconcileAppleMembership,
  parseAppleTransactionInfo,
  parseAppleRenewalInfo,
} from '../../shared/apple/apple-membership.ts';

/**
 * RC20.3 — App Store Server Notifications V2 Endpoint
 *
 * Receives Apple's POST containing a signedPayload JWS.
 *
 * Does NOT implement V1 as the primary architecture.
 * Does NOT trust decoded JSON without validating the signed payload.
 *
 * Flow:
 *   1. Receive POST { signedPayload }
 *   2. Verify the outer JWS (signature + certificate chain)
 *   3. Decode the notification payload
 *   4. Verify nested signedTransactionInfo + signedRenewalInfo JWS
 *   5. Process notificationType / subtype
 *   6. Update the matching Apple-backed MembershipSubscription
 *   7. Respond 200 (idempotent — repeated notifications converge)
 *
 * Notification URL (production):
 *   https://borisend-smart-connect.base44.app/functions/appleServerNotifications
 *
 * DEVELOPER ACTION REQUIRED: Configure this URL in App Store Connect →
 * App → App Information → App Store Server Notifications V2.
 *
 * Lifecycle events handled:
 *   SUBSCRIBED           — initial purchase
 *   DID_RENEW            — successful renewal
 *   DID_CHANGE_RENEWAL_STATUS — auto-renew toggled on/off
 *   EXPIRED              — subscription expired (no more access)
 *   GRACE_PERIOD_EXPIRED — billing retry ended, access removed
 *   DID_FAIL_TO_RENEW    — billing retry (access preserved during grace)
 *   REFUND               — Apple refunded (revocation)
 *   REVOKE               — family sharing revocation
 *   DID_CHANGE_RENEWAL_PREF — user changed renewal preference (upgrade/downgrade)
 *
 * Entitlement is based on VERIFIED transaction state (expiresDate,
 * revocationDate) — not on the notification alone. The notification triggers
 * a reconcile; the EntitlementService reads the resulting membership record.
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const body = await req.json();
    const { signedPayload } = body;
    if (!signedPayload) {
      return Response.json({ error: 'Missing signedPayload' }, { status: 400 });
    }

    // ── Verify the outer JWS ──
    let notification;
    try {
      notification = await verifyAppleJWS(signedPayload);
    } catch (e) {
      console.error('[appleServerNotifications] Outer JWS verification failed:', e.message);
      // Apple expects a non-2xx to retry, but a 400 prevents infinite retries of malformed payloads
      return Response.json({ error: 'Signature verification failed' }, { status: 400 });
    }

    const notificationType = notification.notificationType;
    const subtype = notification.subtype || null;
    const data = notification.data || {};

    // ── Verify nested JWS (signedTransactionInfo + signedRenewalInfo) ──
    let txnInfo = null;
    let renewalInfo = null;

    if (data.signedTransactionInfo) {
      try {
        txnInfo = await verifyAppleJWS(data.signedTransactionInfo);
      } catch (e) {
        console.error('[appleServerNotifications] signedTransactionInfo JWS failed:', e.message);
        // Still acknowledge to Apple (200) — repeated retries won't fix a bad signature
        return Response.json({ received: true, warning: 'transactionInfo verification failed' }, { status: 200 });
      }
    }
    if (data.signedRenewalInfo) {
      try {
        renewalInfo = await verifyAppleJWS(data.signedRenewalInfo);
      } catch {
        // Non-fatal
        renewalInfo = null;
      }
    }

    // ── Resolve the owning user from the verified transaction ──
    // The notification does NOT contain a BoriSend user ID.
    // We look up the existing MembershipSubscription by originalTransactionId.
    if (!txnInfo) {
      // Some notification types (e.g. TEST) may not have transaction info
      return Response.json({ received: true, type: notificationType, note: 'no transaction info' }, { status: 200 });
    }

    const txn = parseAppleTransactionInfo(txnInfo);
    const renewal = renewalInfo ? parseAppleRenewalInfo(renewalInfo) : null;

    // Find existing membership by originalTransactionId to resolve the user
    const existing = await sr.entities.MembershipSubscription
      .filter({ apple_original_transaction_id: txn.originalTransactionId })
      .catch(() => []);

    if (!existing || existing.length === 0) {
      // No existing membership for this transaction.
      // The user hasn't verified this purchase through the app yet.
      // Apple will retry; when the user opens the app and verifies/restores,
      // the membership will be created then.
      // Acknowledge to stop retries for notifications we can't act on.
      console.info(`[appleServerNotifications] ${notificationType}: no existing membership for originalTransactionId ${txn.originalTransactionId} — awaiting client verification`);
      return Response.json({ received: true, type: notificationType, note: 'no existing membership — awaiting client verification' }, { status: 200 });
    }

    const membership = existing[0];
    const userId = membership.owner_user_id;

    // ── Process lifecycle events ──
    // Reconciliation is idempotent — the same originalTransactionId always
    // updates the same membership record regardless of notification type.
    // The notification is the trigger; the verified transaction state is the authority.
    const result = await reconcileAppleMembership(sr, userId, txn, renewal);

    if (!result.success) {
      console.error(`[appleServerNotifications] ${notificationType} reconcile failed for user ${userId}:`, result.error);
      // 200 to prevent infinite retries for non-recoverable errors
      // (conflicts, unknown products, etc.)
    } else {
      console.info(`[appleServerNotifications] ${notificationType}${subtype ? '/' + subtype : ''} processed for user ${userId}`);
    }

    return Response.json({ received: true, type: notificationType }, { status: 200 });
  } catch (error) {
    console.error('[appleServerNotifications] error:', error.message);
    // 500 — Apple will retry
    return Response.json({ error: error.message }, { status: 500 });
  }
});