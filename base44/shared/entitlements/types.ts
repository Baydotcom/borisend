/**
 * RC12/RC18 — Entitlement engine types.
 * Stable system keys for all capacity types.
 *
 * RC18 adds:
 *   MESSAGE_PASSES — Message Passes (skip allowance)
 *   SMART_MESSAGES — Smart Message execution units
 *
 * message_units remains the system key for Generated Messages (backward
 * compatibility with existing add-on Stripe products). UI labels it
 * "Generated Messages" — no separate generated_messages entitlement type
 * is created (§34).
 */
export type EntitlementType =
  | 'communication_plan_units'
  | 'recipient_units'
  | 'message_units'
  | 'message_passes'
  | 'smart_message_units';

export const ENTITLEMENT_TYPES = {
  PLAN: 'communication_plan_units' as EntitlementType,
  RECIPIENT: 'recipient_units' as EntitlementType,
  MESSAGE: 'message_units' as EntitlementType,
  MESSAGE_PASSES: 'message_passes' as EntitlementType,
  SMART_MESSAGES: 'smart_message_units' as EntitlementType,
};

export interface EntitlementBreakdown {
  base: number;
  addons: number;
  promotions: number;
  adjustments: number;
  effective: number;
}

export interface EffectiveEntitlements {
  communication_plan_units: EntitlementBreakdown;
  recipient_units: EntitlementBreakdown;
  message_units: EntitlementBreakdown;
  message_passes: EntitlementBreakdown;
  smart_message_units: EntitlementBreakdown;
  membershipStatus: 'active' | 'trial' | 'grace' | 'none';
  membershipConfigId: string | null;
  billingInterval: 'monthly' | 'annual' | null;
  periodEnd: string | null;
  periodStart: string | null;
  cancelAtPeriodEnd: boolean;
  /** True when base entitlement comes from a legacy UserSubscription (migration bridge). */
  legacyBridge: boolean;
  /** Start of the current monthly message-entitlement window (billing-period aligned). Null for trial (all-time). */
  messagePeriodStart: string | null;
  /** True when the user is in trial — message entitlement is TOTAL (not monthly). */
  isTrialMessageEntitlement: boolean;
  /** RC20.3: Which payment provider backs this membership ('stripe' | 'apple' | null). EntitlementService does NOT branch on this. */
  paymentProvider: string | null;
}

export interface CapacityTypeStatus {
  used: number;
  effective: number;
  remaining: number;
  overCapacity: number;
  isOverCapacity: boolean;
  breakdown: EntitlementBreakdown;
}

export interface CapacityStatus {
  userId: string;
  plan: CapacityTypeStatus;
  recipient: CapacityTypeStatus;
  message: CapacityTypeStatus;
  message_pass: CapacityTypeStatus;
  smart_message: CapacityTypeStatus;
  membershipStatus: EffectiveEntitlements['membershipStatus'];
  periodEnd: string | null;
  periodStart: string | null;
  /** RC20.3: Payment provider ('stripe' | 'apple' | null) — for UI manage-subscription routing. */
  paymentProvider: string | null;
  /** RC20.3: Whether the subscription is set to cancel at period end. */
  cancelAtPeriodEnd: boolean;
}

export interface CapacityCheckResult {
  allowed: boolean;
  remaining: number;
  effective: number;
  consumption: number;
  overCapacity: number;
  reason?: string;
}