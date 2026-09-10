/**
 * RC20.3 — Apple Membership Reconciliation
 *
 * Shared logic for creating/updating Apple-backed MembershipSubscription
 * records from verified Apple transaction data.
 *
 * Used by both:
 *   - verifyAppleTransaction (client-initiated purchase/restore verification)
 *   - appleServerNotifications (server notification lifecycle events)
 *
 * The EntitlementService is ALREADY provider-neutral — it checks
 * MembershipSubscription.status + current_period_end, NOT the payment provider.
 * This module simply creates/updates MembershipSubscription records with
 * payment_provider = 'apple' and the correct period/status fields.
 *
 * OWNERSHIP RULES:
 *   - A verified Apple transaction is attached to the AUTHENTICATED user.
 *   - originalTransactionId is the durable subscription-family identifier.
 *   - If originalTransactionId is already attached to another BoriSend user,
 *     an ownership conflict is returned — no silent transfer.
 *   - If originalTransactionId is already attached to the same user, the
 *     record is updated (idempotent — renewals, restores, notifications).
 */

import {
  APPLE_BUNDLE_ID,
  isAllowedAppleProduct,
  getBillingIntervalForAppleProduct,
  appleProductsConfigured,
} from './apple-config.ts';
import { getActiveMembershipConfig } from '../entitlements/entitlement-service.ts';

export interface AppleTransactionInfo {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  bundleId: string;
  environment: string; // 'Sandbox' | 'Production'
  purchaseDate: number | null; // ms since epoch
  expiresDate: number | null; // ms since epoch
  revocationDate: number | null; // ms since epoch
  revocationReason: string | null;
  type: string; // 'Auto-Renewable Subscription'
}

export interface AppleRenewalInfo {
  autoRenewStatus: number; // 0 = off, 1 = on
  autoRenewProductId: string | null;
  expirationReason: number | null;
}

export interface ReconcileResult {
  success: boolean;
  conflict?: boolean;
  error?: string;
  membershipId?: string;
  created?: boolean;
  updated?: boolean;
}

/**
 * Convert Apple's ms-since-epoch to ISO string.
 */
function msToIso(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/**
 * Reconcile a verified Apple transaction with the membership database.
 *
 * @param sr The service-role Base44 client (base44.asServiceRole)
 * @param userId The AUTHENTICATED BoriSend user ID (server-validated)
 * @param txn Verified Apple transaction info
 * @param renewal Verified Apple renewal info (may be null for initial purchase)
 */
export async function reconcileAppleMembership(
  sr: any,
  userId: string,
  txn: AppleTransactionInfo,
  renewal: AppleRenewalInfo | null,
): Promise<ReconcileResult> {
  // ── Validation ──
  if (!appleProductsConfigured()) {
    return { success: false, error: 'Apple product IDs are not yet configured. DEVELOPER ACTION REQUIRED.' };
  }

  if (txn.bundleId && txn.bundleId !== APPLE_BUNDLE_ID) {
    return { success: false, error: 'Transaction bundle ID does not match BoriSend.' };
  }

  if (!isAllowedAppleProduct(txn.productId)) {
    return { success: false, error: `Unknown Apple product ID: ${txn.productId}` };
  }

  if (!txn.originalTransactionId) {
    return { success: false, error: 'Missing originalTransactionId' };
  }

  // ── Ownership check: is this originalTransactionId already attached to another user? ──
  const existingByTxn = await sr.entities.MembershipSubscription
    .filter({ apple_original_transaction_id: txn.originalTransactionId })
    .catch(() => []);

  if (existingByTxn && existingByTxn.length > 0) {
    const existing = existingByTxn[0];
    if (existing.owner_user_id !== userId) {
      // Ownership conflict — do NOT silently transfer
      return {
        success: false,
        conflict: true,
        error: 'This Apple subscription is already linked to another BoriSend account.',
      };
    }
    // Same user — update idempotently
    return await updateAppleMembership(sr, existing.id, userId, txn, renewal);
  }

  // ── Create new Apple-backed membership ──
  return await createAppleMembership(sr, userId, txn, renewal);
}

async function createAppleMembership(
  sr: any,
  userId: string,
  txn: AppleTransactionInfo,
  renewal: AppleRenewalInfo | null,
): Promise<ReconcileResult> {
  const config = await getActiveMembershipConfig(sr);
  if (!config) {
    return { success: false, error: 'BoriSend membership is not configured.' };
  }

  const billingInterval = getBillingIntervalForAppleProduct(txn.productId) || 'monthly';
  const now = new Date();
  const periodEnd = msToIso(txn.expiresDate);
  const periodStart = msToIso(txn.purchaseDate) || now.toISOString();

  // Determine status from verified transaction state
  let status = 'active';
  if (txn.revocationDate != null && txn.revocationDate > 0) {
    status = 'cancelled';
  } else if (periodEnd && new Date(periodEnd) <= now) {
    status = 'expired';
  }

  const autoRenewOff = renewal?.autoRenewStatus === 0;

  const data = {
    owner_user_id: userId,
    membership_config_id: config.id,
    payment_provider: 'apple' as const,
    status,
    billing_interval: billingInterval,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: autoRenewOff,
    apple_original_transaction_id: txn.originalTransactionId,
    apple_transaction_id: txn.transactionId,
    apple_product_id: txn.productId,
    apple_environment: txn.environment || null,
    apple_auto_renew_status: autoRenewOff ? 'off' : 'on',
    apple_revocation_date: msToIso(txn.revocationDate),
    apple_revocation_reason: txn.revocationReason || null,
    // Stripe fields are null for Apple-backed memberships
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
  };

  const created = await sr.entities.MembershipSubscription.create(data);
  return { success: true, membershipId: created.id, created: true };
}

async function updateAppleMembership(
  sr: any,
  membershipId: string,
  userId: string,
  txn: AppleTransactionInfo,
  renewal: AppleRenewalInfo | null,
): Promise<ReconcileResult> {
  const now = new Date();
  const periodEnd = msToIso(txn.expiresDate);
  const periodStart = msToIso(txn.purchaseDate);

  let status = 'active';
  if (txn.revocationDate != null && txn.revocationDate > 0) {
    status = 'cancelled';
  } else if (periodEnd && new Date(periodEnd) <= now) {
    status = 'expired';
  }

  const autoRenewOff = renewal?.autoRenewStatus === 0;

  const update: Record<string, any> = {
    status,
    apple_transaction_id: txn.transactionId,
    apple_environment: txn.environment || null,
    apple_auto_renew_status: autoRenewOff ? 'off' : 'on',
    apple_revocation_date: msToIso(txn.revocationDate),
    apple_revocation_reason: txn.revocationReason || null,
    cancel_at_period_end: autoRenewOff,
  };
  if (periodEnd) update.current_period_end = periodEnd;
  if (periodStart) update.current_period_start = periodStart;

  await sr.entities.MembershipSubscription.update(membershipId, update);
  return { success: true, membershipId, updated: true };
}

/**
 * Extract transaction info fields from a decoded Apple JWS payload.
 * Apple's transactionInfo JWTPayload has these fields.
 */
export function parseAppleTransactionInfo(payload: Record<string, any>): AppleTransactionInfo {
  return {
    originalTransactionId: String(payload.originalTransactionId || payload.original_transaction_id || ''),
    transactionId: String(payload.transactionId || payload.transaction_id || ''),
    productId: String(payload.productId || payload.product_id || ''),
    bundleId: String(payload.bundleId || payload.bundle_id || ''),
    environment: String(payload.environment || 'Production'),
    purchaseDate: typeof payload.purchaseDate === 'number' ? payload.purchaseDate : null,
    expiresDate: typeof payload.expiresDate === 'number' ? payload.expiresDate : null,
    revocationDate: typeof payload.revocationDate === 'number' ? payload.revocationDate : null,
    revocationReason: payload.revocationReason != null ? String(payload.revocationReason) : null,
    type: String(payload.type || 'Auto-Renewable Subscription'),
  };
}

/**
 * Extract renewal info fields from a decoded Apple JWS payload.
 */
export function parseAppleRenewalInfo(payload: Record<string, any>): AppleRenewalInfo {
  return {
    autoRenewStatus: typeof payload.autoRenewStatus === 'number' ? payload.autoRenewStatus : 1,
    autoRenewProductId: payload.autoRenewProductId || null,
    expirationReason: typeof payload.expirationReason === 'number' ? payload.expirationReason : null,
  };
}