import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { verifyAppleJWS } from '../../shared/apple/apple-jws.ts';
import {
  reconcileAppleMembership,
  parseAppleTransactionInfo,
  parseAppleRenewalInfo,
} from '../../shared/apple/apple-membership.ts';

/**
 * RC20.3 — verifyAppleTransaction
 *
 * Authenticated server endpoint that receives a signed Apple transaction
 * (JWS from StoreKit 2) and verifies it.
 *
 * Does NOT use the deprecated verifyReceipt endpoint.
 * Uses modern Apple signed-transaction / JWS verification architecture.
 *
 * Flow:
 *   1. Authenticate the calling BoriSend user (server-validated)
 *   2. Verify the JWS signature + certificate chain (apple-jws.ts)
 *   3. Validate bundle ID, product ID, environment
 *   4. Check ownership (originalTransactionId already attached to another user?)
 *   5. Create/update MembershipSubscription (payment_provider = 'apple')
 *   6. Return success/conflict/error
 *
 * Idempotent: repeated calls with the same originalTransactionId update
 * the same MembershipSubscription record — no duplicates.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    // ── Authenticate the calling user ──
    let userId = null;
    try {
      const user = await base44.auth.me();
      if (user) userId = user.id;
    } catch (e) {
      console.info('[verifyAppleTransaction] User not authenticated:', e.message);
    }
    if (!userId) {
      return Response.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const { signedTransaction, action } = body;
    if (!signedTransaction) {
      return Response.json({ success: false, error: 'Missing signedTransaction.' }, { status: 400 });
    }

    // ── Verify the JWS (signature + certificate chain) ──
    let transactionPayload;
    try {
      transactionPayload = await verifyAppleJWS(signedTransaction);
    } catch (e) {
      console.error('[verifyAppleTransaction] JWS verification failed:', e.message);
      return Response.json({ success: false, error: 'Transaction verification failed.' }, { status: 400 });
    }

    // The JWS payload from StoreKit 2 is the JWSTransaction body directly.
    // For App Store Server API, it may contain signedTransactionInfo (nested JWS).
    let txnInfo = transactionPayload;
    let renewalInfo = null;

    // If the payload contains nested signedTransactionInfo (App Store Server API format),
    // verify that too.
    if (transactionPayload.signedTransactionInfo) {
      try {
        txnInfo = await verifyAppleJWS(transactionPayload.signedTransactionInfo);
      } catch (e) {
        console.error('[verifyAppleTransaction] Nested transactionInfo JWS failed:', e.message);
        return Response.json({ success: false, error: 'Transaction info verification failed.' }, { status: 400 });
      }
    }
    if (transactionPayload.signedRenewalInfo) {
      try {
        renewalInfo = await verifyAppleJWS(transactionPayload.signedRenewalInfo);
      } catch {
        // Non-fatal — renewal info is optional for initial purchase verification
        renewalInfo = null;
      }
    }

    // ── Parse and validate ──
    const txn = parseAppleTransactionInfo(txnInfo);
    const renewal = renewalInfo ? parseAppleRenewalInfo(renewalInfo) : null;

    // ── Reconcile with membership database ──
    const result = await reconcileAppleMembership(sr, userId, txn, renewal);

    if (result.conflict) {
      return Response.json({ success: false, conflict: true, error: result.error }, { status: 409 });
    }
    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: 400 });
    }

    console.info(`[verifyAppleTransaction] Apple membership ${result.created ? 'created' : 'updated'} for user ${userId} (action: ${action || 'purchase'})`);
    return Response.json({ success: true, created: result.created, updated: result.updated });
  } catch (error) {
    console.error('[verifyAppleTransaction] error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});