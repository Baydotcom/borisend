/**
 * RC12/RC18 — Authoritative Entitlement Service.
 *
 * Single source of truth for BoriSend 2.0 commercial capacity.
 *
 * RC18 adds two new entitlement types:
 *   MESSAGE_PASSES — allows skipping a Generated Message without refunding it
 *   SMART_MESSAGES — fixed user-authored message execution allowance
 *
 * Effective entitlement per capacity type:
 *   BASE MEMBERSHIP INCLUDED
 *   + ACTIVE ADD-ON ENTITLEMENTS
 *   + ACTIVE PROMOTIONAL ENTITLEMENTS
 *   + ACTIVE ADMIN ADJUSTMENTS
 *   = EFFECTIVE ENTITLEMENT
 *
 * Consumption sources (all deletion-resistant):
 *   Plan Unit        = count of ACTIVE Communication Plans
 *   Recipient        = count of ACTIVE PlanRecipients (with eligible parent Campaign)
 *   Generated Msg    = GenerationUsageLedger unique generation_keys (current period)
 *   Message Pass     = MessagePassUsageLedger unique generation_keys (current period)
 *   Smart Message    = SmartMessageUsageLedger unique execution_keys (current period)
 */
import {
  ENTITLEMENT_TYPES,
  type EffectiveEntitlements,
  type CapacityStatus,
  type CapacityCheckResult,
} from './types.ts';

const ACTIVE_MEMBERSHIP_STATUSES = ['active', 'trial', 'grace', 'past_due'];
const ACTIVE_ADDON_STATUSES = ['active', 'cancel_at_period_end', 'past_due'];
const ELIGIBLE_CAMPAIGN_STATUSES = ['active', 'paused'];

function nowWithin(now: Date, start?: string | null, end?: string | null): boolean {
  if (start) { if (now < new Date(start)) return false; }
  if (end) { if (now > new Date(end)) return false; }
  return true;
}

/**
 * RC18.3.3 §9/§11: Determine whether an AddOnSubscription currently contributes
 * to effective capacity.
 *
 * - active/cancel_at_period_end/past_due: contributes if now < current_period_end.
 * - scheduled: a next-period renewal. Contributes ONLY once now >= effective_from
 *   AND now < current_period_end. Before effective_from it must NOT contribute
 *   (TEST L). After the boundary it is lazily promoted (no cron required).
 * - expired/cancelled: never contributes.
 *
 * This is the single canonical add-on eligibility predicate. Both
 * getEffectiveEntitlements and the expiry-reminder scheduler use it.
 */
export function isAddonCurrentlyEffective(s: any, now: Date = new Date()): boolean {
  if (!s) return false;
  if (s.status === 'scheduled') {
    if (!s.effective_from) return false;
    if (now < new Date(s.effective_from)) return false;
    if (s.current_period_end && now >= new Date(s.current_period_end)) return false;
    return true;
  }
  if (!ACTIVE_ADDON_STATUSES.includes(s.status)) return false;
  // RC18.3.4 §20/§21: Half-open interval [start, end) — at the exact boundary
  // timestamp, the old add-on becomes ineffective AND the scheduled renewal
  // becomes effective simultaneously. Using >= (not >) ensures no double-count
  // at the boundary. Both active and scheduled use the same convention.
  if (s.current_period_end && now >= new Date(s.current_period_end)) return false;
  return true;
}

/**
 * Resolve the active membership configuration (the ONE BoriSend 2.0 membership product).
 */
export async function getActiveMembershipConfig(sr): Promise<any | null> {
  const all = await sr.entities.MembershipConfiguration.list('display_order', 50);
  return all.find(c => c.is_active) || all[0] || null;
}

/**
 * Determine whether the user has an active (or trialing) BoriSend 2.0 membership.
 * Falls back to a legacy UserSubscription as a migration bridge (RC12 §31).
 */
export async function resolveMembership(sr, userId: string, now = new Date()): Promise<{
  status: 'active' | 'trial' | 'grace' | 'none';
  configId: string | null;
  billingInterval: 'monthly' | 'annual' | null;
  periodEnd: string | null;
  periodStart: string | null;
  cancelAtPeriodEnd: boolean;
  legacyBridge: boolean;
}> {
  const memSubs = await sr.entities.MembershipSubscription.filter({ owner_user_id: userId });
  const memSub = memSubs
    .filter(s => ACTIVE_MEMBERSHIP_STATUSES.includes(s.status))
    .filter(s => !s.current_period_end || now <= new Date(s.current_period_end))
    .sort((a, b) => new Date(b.current_period_end || b.created_date || 0).getTime() - new Date(a.current_period_end || a.created_date || 0).getTime())[0];

  if (memSub) {
    let status: 'active' | 'trial' | 'grace' | 'none' = memSub.status === 'trial' ? 'trial' : memSub.status === 'grace' ? 'grace' : 'active';
    if (memSub.status === 'trial' && memSub.trial_ends_at && now > new Date(memSub.trial_ends_at)) status = 'none';
    return {
      status,
      configId: memSub.membership_config_id,
      billingInterval: memSub.billing_interval || 'monthly',
      periodEnd: memSub.current_period_end || memSub.trial_ends_at || null,
      periodStart: memSub.current_period_start || null,
      cancelAtPeriodEnd: !!memSub.cancel_at_period_end,
      legacyBridge: false,
      paymentProvider: memSub.payment_provider || 'stripe',
    };
  }

  // Legacy bridge
  let legacySubs = await sr.entities.UserSubscription.filter({ owner_user_id: userId });
  if (!legacySubs || legacySubs.length === 0) {
    legacySubs = await sr.entities.UserSubscription.filter({ created_by_id: userId });
  }
  const legacy = legacySubs[0];
  if (legacy && (legacy.status === 'active' || legacy.status === 'trial')) {
    const trialEndsAt = legacy.trial_ends_at ? new Date(legacy.trial_ends_at) : null;
    const isTrialActive = legacy.status === 'trial' && (!trialEndsAt || now <= trialEndsAt);
    const isPaidActive = legacy.status === 'active';
    if (isTrialActive || isPaidActive) {
      const config = await getActiveMembershipConfig(sr);
      let legacyMaxCampaigns = null;
      if (legacy.plan_id) {
        const lp = await sr.entities.SubscriptionPlan.get(legacy.plan_id).catch(() => null);
        if (lp) legacyMaxCampaigns = lp.max_campaigns;
      }
      if (legacyMaxCampaigns == null && legacy.plan_name) {
        const allPlans = await sr.entities.SubscriptionPlan.list('sort_order', 50);
        const lp = allPlans.find(p => p.name === legacy.plan_name);
        if (lp) legacyMaxCampaigns = lp.max_campaigns;
      }
      return {
        status: isTrialActive ? 'trial' : 'active',
        configId: config?.id || null,
        billingInterval: null,
        periodEnd: legacy.current_period_end || legacy.trial_ends_at || null,
        periodStart: legacy.current_period_start || null,
        cancelAtPeriodEnd: false,
        legacyBridge: true,
      };
    }
  }

  return { status: 'none', configId: null, billingInterval: null, periodEnd: null, periodStart: null, cancelAtPeriodEnd: false, legacyBridge: false, paymentProvider: null };
}

/**
 * Compute the full effective entitlement breakdown for a user.
 * RC18: Now includes message_passes and smart_message_units.
 */
export async function getEffectiveEntitlements(sr, userId: string, now = new Date()): Promise<EffectiveEntitlements> {
  const membership = await resolveMembership(sr, userId, now);
  const config = membership.configId
    ? (await sr.entities.MembershipConfiguration.get(membership.configId).catch(() => null))
    : (membership.status !== 'none' ? await getActiveMembershipConfig(sr) : null);

  let trialConfig: any = null;
  if (membership.status === 'trial') {
    const trials = await sr.entities.TrialConfiguration.filter({ is_active: true }).catch(() => []);
    trialConfig = trials[0] || null;
  }
  const isTrialMsg = membership.status === 'trial';

  // Base capacity: trial uses TrialConfiguration; otherwise the membership config.
  const basePlan = membership.status !== 'none'
    ? (isTrialMsg ? (trialConfig?.included_plan_units ?? 1)
       : config ? (config.included_plan_units || 0) : (membership.legacyBridge ? 1 : 0))
    : 0;
  const baseRecipient = membership.status !== 'none'
    ? (isTrialMsg ? (trialConfig?.included_recipient_units ?? 2)
       : config ? (config.included_recipient_units || 0) : (membership.legacyBridge ? 999999 : 0))
    : 0;
  const baseMessage = membership.status !== 'none'
    ? (isTrialMsg ? (trialConfig?.included_message_units ?? 5)
       : config ? (config.included_message_units || 0) : (membership.legacyBridge ? 999999 : 0))
    : 0;
  // RC18.3.1: Message Passes and Smart Messages — read from stored config values.
  // No magic fallback numbers; the config records explicitly store these values.
  const baseMessagePass = membership.status !== 'none'
    ? (isTrialMsg ? (trialConfig?.included_message_passes ?? 0)
       : config ? (config.included_message_passes ?? 0) : (membership.legacyBridge ? 999999 : 0))
    : 0;
  const baseSmartMessage = membership.status !== 'none'
    ? (isTrialMsg ? (trialConfig?.included_smart_messages ?? 0)
       : config ? (config.included_smart_message_units ?? 0) : (membership.legacyBridge ? 999999 : 0))
    : 0;

  const messagePeriodStart = isTrialMsg
    ? null
    : (membership.status !== 'none' ? getMonthlyMessageWindow(membership.periodStart, now) : null);

  // Add-ons only count when user has an eligible active membership.
  const addonEligible = membership.status !== 'none';
  const addOnSubs = addonEligible
    ? await sr.entities.AddOnSubscription.filter({ owner_user_id: userId })
    : [];
  // RC18.3.3: Use the canonical eligibility predicate — includes lazily-promoted
  // scheduled renewals (now >= effective_from) and excludes future renewals.
  const activeAddOns = addOnSubs.filter(s => isAddonCurrentlyEffective(s, now));
  const addonPlan = activeAddOns.filter(s => s.entitlement_type === ENTITLEMENT_TYPES.PLAN).reduce((sum, s) => sum + (s.quantity || 0), 0);
  const addonRecipient = activeAddOns.filter(s => s.entitlement_type === ENTITLEMENT_TYPES.RECIPIENT).reduce((sum, s) => sum + (s.quantity || 0), 0);
  const addonMessage = activeAddOns.filter(s => s.entitlement_type === ENTITLEMENT_TYPES.MESSAGE).reduce((sum, s) => sum + (s.quantity || 0), 0);
  const addonMessagePass = activeAddOns.filter(s => s.entitlement_type === ENTITLEMENT_TYPES.MESSAGE_PASSES).reduce((sum, s) => sum + (s.quantity || 0), 0);
  const addonSmartMessage = activeAddOns.filter(s => s.entitlement_type === ENTITLEMENT_TYPES.SMART_MESSAGES).reduce((sum, s) => sum + (s.quantity || 0), 0);

  // Active promotions.
  const promos = await sr.entities.PromotionalEntitlement.filter({ owner_user_id: userId, is_active: true });
  const activePromos = promos.filter(p => nowWithin(now, p.effective_date, p.expiry_date));
  const promoPlan = activePromos.filter(p => p.entitlement_type === ENTITLEMENT_TYPES.PLAN).reduce((sum, p) => sum + (p.quantity || 0), 0);
  const promoRecipient = activePromos.filter(p => p.entitlement_type === ENTITLEMENT_TYPES.RECIPIENT).reduce((sum, p) => sum + (p.quantity || 0), 0);
  const promoMessage = activePromos.filter(p => p.entitlement_type === ENTITLEMENT_TYPES.MESSAGE).reduce((sum, p) => sum + (p.quantity || 0), 0);
  const promoMessagePass = activePromos.filter(p => p.entitlement_type === ENTITLEMENT_TYPES.MESSAGE_PASSES).reduce((sum, p) => sum + (p.quantity || 0), 0);
  const promoSmartMessage = activePromos.filter(p => p.entitlement_type === ENTITLEMENT_TYPES.SMART_MESSAGES).reduce((sum, p) => sum + (p.quantity || 0), 0);

  // Active admin adjustments.
  const adjustments = await sr.entities.AdminEntitlementAdjustment.filter({ owner_user_id: userId, is_active: true });
  const activeAdjustments = adjustments.filter(a => nowWithin(now, a.effective_date, a.is_permanent ? null : a.expiry_date));
  const adjPlan = activeAdjustments.filter(a => a.entitlement_type === ENTITLEMENT_TYPES.PLAN).reduce((sum, a) => sum + (a.quantity || 0), 0);
  const adjRecipient = activeAdjustments.filter(a => a.entitlement_type === ENTITLEMENT_TYPES.RECIPIENT).reduce((sum, a) => sum + (a.quantity || 0), 0);
  const adjMessage = activeAdjustments.filter(a => a.entitlement_type === ENTITLEMENT_TYPES.MESSAGE).reduce((sum, a) => sum + (a.quantity || 0), 0);
  const adjMessagePass = activeAdjustments.filter(a => a.entitlement_type === ENTITLEMENT_TYPES.MESSAGE_PASSES).reduce((sum, a) => sum + (a.quantity || 0), 0);
  const adjSmartMessage = activeAdjustments.filter(a => a.entitlement_type === ENTITLEMENT_TYPES.SMART_MESSAGES).reduce((sum, a) => sum + (a.quantity || 0), 0);

  const planBreakdown = { base: basePlan, addons: addonPlan, promotions: promoPlan, adjustments: adjPlan, effective: basePlan + addonPlan + promoPlan + adjPlan };
  const recipientBreakdown = { base: baseRecipient, addons: addonRecipient, promotions: promoRecipient, adjustments: adjRecipient, effective: baseRecipient + addonRecipient + promoRecipient + adjRecipient };
  const messageBreakdown = { base: baseMessage, addons: addonMessage, promotions: promoMessage, adjustments: adjMessage, effective: baseMessage + addonMessage + promoMessage + adjMessage };
  const messagePassBreakdown = { base: baseMessagePass, addons: addonMessagePass, promotions: promoMessagePass, adjustments: adjMessagePass, effective: baseMessagePass + addonMessagePass + promoMessagePass + adjMessagePass };
  const smartMessageBreakdown = { base: baseSmartMessage, addons: addonSmartMessage, promotions: promoSmartMessage, adjustments: adjSmartMessage, effective: baseSmartMessage + addonSmartMessage + promoSmartMessage + adjSmartMessage };

  return {
    communication_plan_units: planBreakdown,
    recipient_units: recipientBreakdown,
    message_units: messageBreakdown,
    message_passes: messagePassBreakdown,
    smart_message_units: smartMessageBreakdown,
    membershipStatus: membership.status,
    membershipConfigId: membership.configId || config?.id || null,
    billingInterval: membership.billingInterval,
    periodEnd: membership.periodEnd,
    periodStart: membership.periodStart,
    cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    legacyBridge: membership.legacyBridge,
    paymentProvider: membership.paymentProvider,
    messagePeriodStart,
    isTrialMessageEntitlement: isTrialMsg,
  } as EffectiveEntitlements;
}

// ── Consumption queries ──

/**
 * Plan Unit consumption — count of ACTIVE Communication Plans owned by the user.
 */
export async function getPlanUnitConsumption(sr, userId: string): Promise<number> {
  const byUser = await sr.entities.Campaign.filter({ user_id: userId });
  const byCreator = await sr.entities.Campaign.filter({ created_by_id: userId });
  const all = [...new Map([...byUser, ...byCreator].map(c => [c.id, c])).values()];
  // RC18.3.1 §11 — MODEL A (RESERVED CAPACITY): Paused plans continue to
  // consume Plan Units. A user must NOT bypass subscription limits by
  // repeatedly pausing Plans and creating additional Plans. Draft,
  // completed, and archived plans do NOT consume capacity.
  return all.filter(c => c.status === 'active' || c.status === 'paused').length;
}

/**
 * Recipient Unit consumption — count of ACTIVE PlanRecipients whose parent
 * Campaign exists and is in an eligible status (active or paused).
 * RC17.1: Orphaned PlanRecipients are NOT counted.
 */
export async function getRecipientUnitConsumption(sr, userId: string): Promise<number> {
  const prs = await sr.entities.PlanRecipient.filter({ owner_user_id: userId, status: 'active' });
  if (prs.length === 0) return 0;
  const byUser = await sr.entities.Campaign.filter({ user_id: userId });
  const byCreator = await sr.entities.Campaign.filter({ created_by_id: userId });
  const campaignMap = new Map([...byUser, ...byCreator].map(c => [c.id, c]));
  return prs.filter(pr => {
    const campaign = campaignMap.get(pr.campaign_id);
    if (!campaign) return false;
    return ELIGIBLE_CAMPAIGN_STATUSES.includes(campaign.status);
  }).length;
}

/**
 * Generated Message consumption — count of deduplicated prepared recipient
 * communications in the current monthly entitlement period. Immutable via
 * GenerationUsageLedger (RC17). One distinct generation_key = one unit.
 */
export async function getMessageUnitConsumption(
  sr, userId: string,
  opts: { isTrial?: boolean; periodStart?: string | null; periodEnd?: string | null; anchorPeriodStart?: string | null } = {},
  now = new Date(),
): Promise<number> {
  const isTrial = !!opts.isTrial;
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;
  if (!isTrial) {
    // RC18.3.4.1: Use the canonical anchor-preserving window calculation.
    // windowEnd comes from the original membership anchor, not from inline
    // JS Date overflow that drifts on month-end anchors (29/30/31).
    const { windowStart: ws, windowEnd: we } = getMonthlyEntitlementWindow(opts.anchorPeriodStart || opts.periodStart, now);
    windowStart = ws;
    windowEnd = we;
    if (opts.periodEnd) {
      const billEnd = new Date(opts.periodEnd);
      if (windowEnd > billEnd) windowEnd = billEnd;
    }
  }

  const consumedKeys = new Set<string>();
  try {
    const ledgerEntries = await sr.entities.GenerationUsageLedger.filter({ user_id: userId, status: 'success', generation_type: 'original' }, '-completed_at', 500);
    for (const e of ledgerEntries) {
      if (!e.generation_key) continue;
      if (!isTrial && e.completed_at) {
        const completed = new Date(e.completed_at);
        if (windowStart && completed < windowStart) continue;
        if (windowEnd && completed >= windowEnd) continue;
      }
      consumedKeys.add(e.generation_key);
    }
  } catch { /* ledger unavailable */ }

  // Backfill: count Message-based generation_keys NOT already in the ledger.
  const byUser = await sr.entities.Message.filter({ user_id: userId }, '-created_date', 200).catch(() => []);
  const byCreator = await sr.entities.Message.filter({ created_by_id: userId }, '-created_date', 200).catch(() => []);
  const all = [...new Map([...byUser, ...byCreator].map(m => [m.id, m])).values()];
  for (const m of all) {
    // RC18.1: Exclude Smart Message executions from Generated Message usage.
    // Smart Messages have smart_message_id set and use the SmartMessageUsageLedger.
    if (m.smart_message_id) continue;
    if (!isTrial && m.created_date) {
      const created = new Date(m.created_date);
      if (windowStart && created < windowStart) continue;
      if (windowEnd && created >= windowEnd) continue;
    }
    const key = m.generation_key || `${m.campaign_id}|${m.plan_recipient_id || m.recipient_name || ''}|${m.occurrence || m.created_date}`;
    consumedKeys.add(key);
  }
  return consumedKeys.size;
}

/**
 * RC18: Message Pass consumption — count of unique generation_keys with a
 * consumed pass in the current entitlement period. Immutable via
 * MessagePassUsageLedger. Deleting a skipped Message does NOT refund the pass.
 *
 * §10 Idempotency: one generation_key = max 1 pass. Repeated skips/retries
 * cannot inflate usage.
 */
export async function getMessagePassConsumption(
  sr, userId: string,
  opts: { isTrial?: boolean; periodStart?: string | null; periodEnd?: string | null; anchorPeriodStart?: string | null } = {},
  now = new Date(),
): Promise<number> {
  const isTrial = !!opts.isTrial;
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;
  if (!isTrial) {
    // RC18.3.4.1: Use the canonical anchor-preserving window calculation.
    const { windowStart: ws, windowEnd: we } = getMonthlyEntitlementWindow(opts.anchorPeriodStart || opts.periodStart, now);
    windowStart = ws;
    windowEnd = we;
    if (opts.periodEnd) {
      const billEnd = new Date(opts.periodEnd);
      if (windowEnd > billEnd) windowEnd = billEnd;
    }
  }

  const consumedKeys = new Set<string>();
  try {
    const ledgerEntries = await sr.entities.MessagePassUsageLedger.filter({ owner_user_id: userId, status: 'consumed' }, '-consumed_at', 500);
    for (const e of ledgerEntries) {
      if (!e.generation_key) continue;
      if (!isTrial && e.consumed_at) {
        const consumed = new Date(e.consumed_at);
        if (windowStart && consumed < windowStart) continue;
        if (windowEnd && consumed >= windowEnd) continue;
      }
      consumedKeys.add(e.generation_key);
    }
  } catch { /* ledger unavailable */ }

  return consumedKeys.size;
}

/**
 * RC18: Smart Message consumption — count of unique execution_keys with a
 * consumed execution in the current entitlement period. Immutable via
 * SmartMessageUsageLedger. One occurrence to one recipient = one unit.
 */
export async function getSmartMessageConsumption(
  sr, userId: string,
  opts: { isTrial?: boolean; periodStart?: string | null; periodEnd?: string | null; anchorPeriodStart?: string | null } = {},
  now = new Date(),
): Promise<number> {
  const isTrial = !!opts.isTrial;
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;
  if (!isTrial) {
    // RC18.3.4.1: Use the canonical anchor-preserving window calculation.
    const { windowStart: ws, windowEnd: we } = getMonthlyEntitlementWindow(opts.anchorPeriodStart || opts.periodStart, now);
    windowStart = ws;
    windowEnd = we;
    if (opts.periodEnd) {
      const billEnd = new Date(opts.periodEnd);
      if (windowEnd > billEnd) windowEnd = billEnd;
    }
  }

  const consumedKeys = new Set<string>();
  try {
    const ledgerEntries = await sr.entities.SmartMessageUsageLedger.filter({ owner_user_id: userId, status: 'consumed' }, '-consumed_at', 500);
    for (const e of ledgerEntries) {
      if (!e.execution_key) continue;
      if (!isTrial && e.consumed_at) {
        const consumed = new Date(e.consumed_at);
        if (windowStart && consumed < windowStart) continue;
        if (windowEnd && consumed >= windowEnd) continue;
      }
      consumedKeys.add(e.execution_key);
    }
  } catch { /* ledger unavailable */ }

  return consumedKeys.size;
}

function typeStatus(effective: number, used: number) {
  return {
    used,
    effective,
    remaining: effective - used,
    overCapacity: Math.max(0, used - effective),
    isOverCapacity: used > effective,
  };
}

/**
 * Full capacity status for a user. RC18: now returns 5 capacity blocks.
 * This is the single object the frontend displays and the backend enforces.
 */
export async function getCapacityStatus(sr, userId: string, now = new Date()): Promise<CapacityStatus> {
  const ent = await getEffectiveEntitlements(sr, userId, now);
  const planUsed = await getPlanUnitConsumption(sr, userId);
  const recipientUsed = await getRecipientUnitConsumption(sr, userId);
  const messageUsed = await getMessageUnitConsumption(sr, userId, { isTrial: ent.isTrialMessageEntitlement, anchorPeriodStart: ent.periodStart, periodStart: ent.messagePeriodStart, periodEnd: ent.periodEnd }, now);
  const messagePassUsed = await getMessagePassConsumption(sr, userId, { isTrial: ent.isTrialMessageEntitlement, anchorPeriodStart: ent.periodStart, periodStart: ent.messagePeriodStart, periodEnd: ent.periodEnd }, now);
  const smartMessageUsed = await getSmartMessageConsumption(sr, userId, { isTrial: ent.isTrialMessageEntitlement, anchorPeriodStart: ent.periodStart, periodStart: ent.messagePeriodStart, periodEnd: ent.periodEnd }, now);
  // RC18.3.3 §2/§10: Return the active add-on subscriptions with period info
  // so customer surfaces can display the ACTUAL expiry date from the
  // authoritative record — not a competing frontend calculation.
  const allAddOnSubs = ent.membershipStatus !== 'none'
    ? await sr.entities.AddOnSubscription.filter({ owner_user_id: userId })
    : [];
  const addonSummary = allAddOnSubs
    .filter(s => s.status === 'active' || s.status === 'cancel_at_period_end' || s.status === 'scheduled' || s.status === 'past_due')
    .map(s => ({
      id: s.id,
      add_on_product_id: s.add_on_product_id,
      entitlement_type: s.entitlement_type,
      quantity: s.quantity || 0,
      status: s.status,
      purchase_mode: s.purchase_mode || 'current',
      effective_from: s.effective_from || null,
      period_start: s.current_period_start || null,
      period_end: s.current_period_end || null,
      auto_renew: !!s.auto_renew,
      is_currently_effective: isAddonCurrentlyEffective(s, now),
    }));

  return {
    userId,
    plan: { ...typeStatus(ent.communication_plan_units.effective, planUsed), breakdown: ent.communication_plan_units },
    recipient: { ...typeStatus(ent.recipient_units.effective, recipientUsed), breakdown: ent.recipient_units },
    message: { ...typeStatus(ent.message_units.effective, messageUsed), breakdown: ent.message_units },
    message_pass: { ...typeStatus(ent.message_passes.effective, messagePassUsed), breakdown: ent.message_passes },
    smart_message: { ...typeStatus(ent.smart_message_units.effective, smartMessageUsed), breakdown: ent.smart_message_units },
    membershipStatus: ent.membershipStatus,
    periodEnd: ent.periodEnd,
    periodStart: ent.periodStart,
    paymentProvider: ent.paymentProvider,
    cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
    addons: addonSummary,
  };
}

// ── Capacity checks ──

export async function canActivatePlan(sr, userId: string, additional = 1, now = new Date()): Promise<CapacityCheckResult> {
  const ent = await getEffectiveEntitlements(sr, userId, now);
  const used = await getPlanUnitConsumption(sr, userId);
  const effective = ent.communication_plan_units.effective;
  const remaining = effective - used;
  const allowed = remaining >= additional;
  return { allowed, remaining, effective, consumption: used, overCapacity: Math.max(0, used - effective), reason: allowed ? undefined : `You've reached your Communication Plan capacity (${used} of ${effective} used).` };
}

export async function canActivateRecipients(sr, userId: string, additional: number, now = new Date()): Promise<CapacityCheckResult> {
  const ent = await getEffectiveEntitlements(sr, userId, now);
  const used = await getRecipientUnitConsumption(sr, userId);
  const effective = ent.recipient_units.effective;
  const remaining = effective - used;
  const allowed = remaining >= additional;
  return { allowed, remaining, effective, consumption: used, overCapacity: Math.max(0, used - effective), reason: allowed ? undefined : `You've reached your Recipient capacity (${used} of ${effective} used).` };
}

/**
 * RC16.1: Generated Message capacity check (before LLM generation).
 */
export async function checkMessageCapacity(sr, userId: string, requiredUnits: number, now = new Date()): Promise<{ allowed: boolean; remaining: number; effective: number; used: number; requiredUnits: number; isTrial: boolean; reason?: string }> {
  const ent = await getEffectiveEntitlements(sr, userId, now);
  const used = await getMessageUnitConsumption(sr, userId, { isTrial: ent.isTrialMessageEntitlement, anchorPeriodStart: ent.periodStart, periodStart: ent.messagePeriodStart, periodEnd: ent.periodEnd }, now);
  const effective = ent.message_units.effective;
  const remaining = effective - used;
  const allowed = requiredUnits === 0 ? true : remaining >= requiredUnits;
  return { allowed, remaining, effective, used, requiredUnits, isTrial: ent.isTrialMessageEntitlement, reason: allowed ? undefined : `You've used your Generated Messages for this period.` };
}

/**
 * RC18: Message Pass capacity check (before Skip).
 * §10: Idempotent — if the generation_key already has a consumed pass, the
 * skip is idempotent (allowed=true, no additional pass consumed).
 */
export async function checkMessagePassCapacity(sr, userId: string, generationKey: string, now = new Date()): Promise<{ allowed: boolean; remaining: number; effective: number; used: number; isIdempotent: boolean; reason?: string }> {
  const ent = await getEffectiveEntitlements(sr, userId, now);
  const used = await getMessagePassConsumption(sr, userId, { isTrial: ent.isTrialMessageEntitlement, anchorPeriodStart: ent.periodStart, periodStart: ent.messagePeriodStart, periodEnd: ent.periodEnd }, now);

  // §10 Idempotency: check if this generation_key already consumed a pass.
  let alreadyConsumed = false;
  try {
    const existing = await sr.entities.MessagePassUsageLedger.filter({ owner_user_id: userId, generation_key: generationKey, status: 'consumed' });
    alreadyConsumed = existing.length > 0;
  } catch { /* non-blocking */ }

  if (alreadyConsumed) {
    return { allowed: true, remaining: ent.message_passes.effective - used, effective: ent.message_passes.effective, used, isIdempotent: true };
  }

  const effective = ent.message_passes.effective;
  const remaining = effective - used;
  const allowed = remaining >= 1;
  return { allowed, remaining, effective, used, isIdempotent: false, reason: allowed ? undefined : "You've used your Message Passes for this period." };
}

/**
 * RC18: Smart Message capacity check (before execution).
 * §23: BLOCKS the entire multi-recipient execution atomically — does not
 * partially execute. requiredUnits = number of recipients in this occurrence.
 */
export async function checkSmartMessageCapacity(sr, userId: string, requiredUnits: number, now = new Date()): Promise<{ allowed: boolean; remaining: number; effective: number; used: number; requiredUnits: number; reason?: string }> {
  const ent = await getEffectiveEntitlements(sr, userId, now);
  const used = await getSmartMessageConsumption(sr, userId, { isTrial: ent.isTrialMessageEntitlement, anchorPeriodStart: ent.periodStart, periodStart: ent.messagePeriodStart, periodEnd: ent.periodEnd }, now);
  const effective = ent.smart_message_units.effective;
  const remaining = effective - used;
  const allowed = requiredUnits === 0 ? true : remaining >= requiredUnits;
  return { allowed, remaining, effective, used, requiredUnits, reason: allowed ? undefined : `Not enough Smart Messages for this period (${remaining} remaining, ${requiredUnits} needed).` };
}

// ── Concurrency: per-user capacity mutex (reuses GenerationLock) ──

export async function acquireCapacityLock(sr, userId: string, requestId: string, ttlMs = 15000): Promise<{ acquired: boolean; lockId?: string; reason?: string }> {
  const key = `capacity:${userId}`;
  const now = new Date();
  const existing = await sr.entities.GenerationLock.filter({ generation_key: key, status: 'active' });
  const live = existing.find(l => l.locked_until && new Date(l.locked_until) > now);
  if (live) return { acquired: false, reason: 'A capacity update is already in progress. Please retry in a moment.' };
  const lock = await sr.entities.GenerationLock.create({ generation_key: key, status: 'active', locked_at: now.toISOString(), locked_until: new Date(now.getTime() + ttlMs).toISOString(), request_id: requestId, owner_user_id: userId });
  return { acquired: true, lockId: lock.id };
}

export async function releaseCapacityLock(sr, lockId: string | undefined): Promise<void> {
  if (!lockId) return;
  try { await sr.entities.GenerationLock.update(lockId, { status: 'released' }); } catch (_) {}
}

/**
 * RC18.3.4.1: Return the last valid calendar day of the given (year, month).
 * month is 0-indexed (0 = January).
 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * RC18.3.4.1: Add `months` to `anchor` while preserving the ORIGINAL anchor day.
 *
 * JavaScript's `new Date(year, month + 1, day)` silently overflows when `day`
 * exceeds the target month's length (e.g. Jan 31 + 1 month → March 3, not
 * Feb 28). If the result is then used as the base for the next addition, the
 * anchor day permanently drifts (31 → 3 → 3 → 3 …).
 *
 * This function always reads the day from the ORIGINAL anchor, clamping to the
 * target month's last valid day when the anchor day does not exist. The anchor
 * day itself is never mutated, so subsequent calls from the same anchor produce
 * correct boundaries indefinitely.
 *
 *   anchor Jan 31, +1 → Feb 28 (clamped)     [non-leap]
 *   anchor Jan 31, +2 → Mar 31 (restored)
 *   anchor Jan 31, +3 → Apr 30 (clamped)
 *   anchor Jan 31, +4 → May 31 (restored)
 *   anchor Jan 31 2028, +1 → Feb 29 (leap)
 */
export function addMonthsAnchorPreserving(anchor: Date, months: number): Date {
  const totalMonths = anchor.getMonth() + months;
  const targetYear = anchor.getFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const anchorDay = anchor.getDate();
  const maxDay = daysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(anchorDay, maxDay);
  return new Date(
    targetYear, targetMonth, targetDay,
    anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds(),
  );
}

/**
 * RC18.3.4.1: The SINGLE canonical monthly-entitlement-window calculation.
 *
 * Returns `{ windowStart, windowEnd }` where `windowStart` is the most recent
 * monthly boundary at or before `now`, and `windowEnd` is the next boundary
 * (exclusive — the window is `[windowStart, windowEnd)`).
 *
 * Both boundaries are computed from the ORIGINAL membership anchor — never from
 * a previously-clamped boundary — so the anchor day is preserved across
 * month-end edges (29/30/31) and February without drift.
 *
 * ALL consumers (Generated Message / Message Pass / Smart Message consumption,
 * add-on expiry, scheduled-renewal effective_from / period_end,
 * renewal_intent_key target period, expiry reminders) MUST use this function.
 * No inline `new Date(year, month + 1, day)` arithmetic is permitted for
 * entitlement boundaries.
 */
export function getMonthlyEntitlementWindow(
  periodStart: string | null,
  now: Date,
): { windowStart: Date; windowEnd: Date } {
  if (!periodStart) {
    const ws = new Date(now.getFullYear(), now.getMonth(), 1);
    const we = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { windowStart: ws, windowEnd: we };
  }
  const anchor = new Date(periodStart);
  if (isNaN(anchor.getTime())) {
    const ws = new Date(now.getFullYear(), now.getMonth(), 1);
    const we = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { windowStart: ws, windowEnd: we };
  }
  // Walk forward from the original anchor. Every next-boundary is computed
  // from `anchor` (not from the previous boundary), so clamping in a short
  // month does NOT propagate to the next month.
  let windowStart = new Date(anchor);
  let windowEnd = addMonthsAnchorPreserving(anchor, 1);
  let guard = 0;
  while (guard++ < 48) {
    if (windowEnd > now) break;
    windowStart = windowEnd;
    windowEnd = addMonthsAnchorPreserving(anchor, guard + 1);
  }
  return { windowStart, windowEnd };
}

/**
 * RC16.1 §18 / RC16.6: Compute the start of the current monthly
 * message-entitlement window, anchored to the membership period-start
 * anniversary. Ensures annual members receive 20/month, NOT 240 upfront.
 *
 * RC18.3.4.1: Now anchor-preserving (delegates to the canonical
 * `getMonthlyEntitlementWindow`). No JS Date overflow drift.
 */
export function getMonthlyMessageWindow(periodStart: string | null, now: Date): string | null {
  const { windowStart } = getMonthlyEntitlementWindow(periodStart, now);
  return windowStart.toISOString();
}