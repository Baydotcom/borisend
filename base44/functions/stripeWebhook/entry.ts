import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';
import { getMonthlyEntitlementWindow } from '../../shared/entitlements/entitlement-service.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not set");
      return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    // Handle new subscription
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const productType = session.metadata?.product_type;

      // ── RC12: BoriSend 2.0 membership / add-on checkout (authoritative) ──
      if (productType === 'membership' || productType === 'addon') {
        await handleRc12Checkout(base44, session);
        return Response.json({ received: true });
      }

      // Legacy plan-based checkout (Starter/Professional/...) continues below.
      const planId = session.metadata?.plan_id;
      const userId = session.metadata?.user_id || session.client_reference_id;

      if (!userId || !planId) {
        console.error("Missing user_id or plan_id in session metadata");
        return Response.json({ error: "Missing metadata" }, { status: 400 });
      }

      const plan = await base44.asServiceRole.entities.SubscriptionPlan.get(planId);
      if (!plan) {
        console.error("Plan not found:", planId);
        return Response.json({ error: "Plan not found" }, { status: 400 });
      }

      const now = new Date();
      const periodEnd = new Date(now);
      // Determine period length from metadata
      const isAnnual = session.metadata?.billing_interval === "yearly";
      if (isAnnual) {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const subData = {
        owner_user_id: userId,
        plan_id: plan.id,
        plan_name: plan.name,
        status: "active",
        monthly_limit: plan.monthly_message_limit,
        max_campaigns: plan.max_campaigns,
        messages_used_this_month: 0,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        last_reset_date: now.toISOString().split("T")[0],
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      };

      const existing = await base44.asServiceRole.entities.UserSubscription.filter({ owner_user_id: userId });
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.UserSubscription.update(existing[0].id, subData);
      } else {
        await base44.asServiceRole.entities.UserSubscription.create(subData);
      }

      // ── Referral reward: trigger "became_paid" event ──
      try {
        await base44.asServiceRole.functions.invoke('processRewardEvent', {
          referred_user_id: userId,
          event_type: 'became_paid',
          trigger_source: 'stripe_webhook'
        });
      } catch (referralError) {
        console.error('[WEBHOOK] Referral reward trigger failed:', referralError.message);
      }
    }

    // Handle invoice paid — reset usage on renewal + trigger commission processing
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      // ── RC12: refresh membership/add-on billing periods on renewal ──
      await refreshRc12FromInvoice(base44, invoice);

      // Reset usage on renewal cycles
      if (invoice.billing_reason === "subscription_cycle" && customerId) {
        const existing = await base44.asServiceRole.entities.UserSubscription.filter({ stripe_customer_id: customerId });
        if (existing && existing.length > 0) {
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          await base44.asServiceRole.entities.UserSubscription.update(existing[0].id, {
            messages_used_this_month: 0,
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            last_reset_date: now.toISOString().split("T")[0],
            status: "active",
          });
        }
      }

      // ── Trigger "became_paid" for trial conversions on first real payment ──
      if (customerId && invoice.total > 0 && invoice.billing_reason === "subscription_cycle") {
        try {
          const subs = await base44.asServiceRole.entities.UserSubscription.filter({ stripe_customer_id: customerId });
          if (subs && subs.length > 0) {
            const sub = subs[0];
            // Mark trial as converted if it was in conversion_scheduled state
            if (sub.trial_conversion_scheduled || sub.trial_status === 'conversion_scheduled') {
              await base44.asServiceRole.entities.UserSubscription.update(sub.id, {
                trial_status: 'converted',
                trial_converted_at: new Date().toISOString(),
                status: 'active',
              });
              await base44.asServiceRole.entities.TrialAuditLog.create({
                user_id: sub.owner_user_id,
                action: 'trial_converted',
                actor: 'system',
                details: `Trial converted to paid subscription via webhook. Invoice ${invoice.id}.`,
              });
            }
            // Trigger became_paid (idempotent — processRewardEvent prevents duplicates)
            await base44.asServiceRole.functions.invoke('processRewardEvent', {
              referred_user_id: sub.owner_user_id,
              event_type: 'became_paid',
              trigger_source: 'stripe_webhook_invoice_paid'
            });
          }
        } catch (referralError) {
          console.error('[WEBHOOK] became_paid trigger failed:', referralError.message);
        }
      }

      // ── Trigger recurring commission processing ──
      if (customerId && invoice.total > 0) {
        try {
          const subs = await base44.asServiceRole.entities.UserSubscription.filter({ stripe_customer_id: customerId });
          if (subs && subs.length > 0) {
            const sub = subs[0];
            // Determine billing period from invoice lines
            let billingPeriod = "monthly";
            const lineInterval = invoice.lines?.data?.[0]?.price?.recurring?.interval;
            if (lineInterval === "year") billingPeriod = "yearly";
            // Fallback: check plan
            if (!lineInterval && sub.plan_id) {
              try {
                const plan = await base44.asServiceRole.entities.SubscriptionPlan.get(sub.plan_id);
                if (plan && plan.billing_period) billingPeriod = plan.billing_period;
              } catch {}
            }

            await base44.asServiceRole.functions.invoke('processCommissionReward', {
              referred_user_id: sub.owner_user_id,
              subscription_id: sub.stripe_subscription_id,
              invoice_id: invoice.id,
              payment_amount: invoice.total / 100,
              billing_period: billingPeriod,
              billing_reason: invoice.billing_reason,
              currency: invoice.currency,
              trigger_source: 'stripe_webhook'
            });
          }
        } catch (commissionError) {
          console.error('[WEBHOOK] Commission processing failed:', commissionError.message);
        }
      }
    }

    // Handle plan upgrade/downgrade (mid-cycle changes)
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const priceId = subscription.items?.data?.[0]?.price?.id;

      // ── RC12: sync membership/add-on status + cancel_at_period_end ──
      await syncRc12FromSubscriptionUpdate(base44, subscription);

      if (customerId && priceId) {
        const existing = await base44.asServiceRole.entities.UserSubscription.filter({ stripe_customer_id: customerId });
        if (existing && existing.length > 0) {
          // Find the matching plan by stripe_price_id (check monthly, annual, and legacy fields)
          const allPlans = await base44.asServiceRole.entities.SubscriptionPlan.list("sort_order", 50);
          const newPlan = allPlans.find(p =>
            p.stripe_price_id === priceId ||
            p.stripe_price_id_monthly === priceId ||
            p.stripe_price_id_annual === priceId
          );

          if (newPlan) {
            await base44.asServiceRole.entities.UserSubscription.update(existing[0].id, {
              plan_id: newPlan.id,
              plan_name: newPlan.name,
              monthly_limit: newPlan.monthly_message_limit,
              max_campaigns: newPlan.max_campaigns,
              status: subscription.status === "active" ? "active" : existing[0].status,
            });
            console.info(`[WEBHOOK] Subscription updated to plan "${newPlan.name}" for customer ${customerId}`);
          }
        }
      }
    }

    // Handle cancellation — enter Paused Mode, NOT Free plan
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // ── RC12: expire membership/add-on capacity ──
      await expireRc12FromSubscriptionDelete(base44, subscription);

      if (customerId) {
        const existing = await base44.asServiceRole.entities.UserSubscription.filter({ stripe_customer_id: customerId });
        if (existing && existing.length > 0) {
          const now = new Date();
          await base44.asServiceRole.entities.UserSubscription.update(existing[0].id, {
            status: "paused",
            paused_at: now.toISOString(),
            pause_reason: "subscription_cancelled",
            // Do NOT revert to Free plan — keep plan info for reference
            // Do NOT null out stripe_customer_id — needed for portal access
            stripe_subscription_id: null,
          });

          await base44.asServiceRole.entities.Notification.create({
            title: 'Subscription cancelled',
            body: 'Your subscription has ended. Choose a plan to continue using BoriSend.',
            type: 'subscription_expired',
            priority: 'high',
            action_label: 'Choose a Plan',
            action_url: '/subscription',
            user_id: existing[0].owner_user_id,
            created_by_id: existing[0].owner_user_id,
          });

          console.info(`[WEBHOOK] Subscription cancelled for customer ${customerId} — account paused (not Free)`);
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── RC12 commercial webhook helpers ──────────────────────────────────────────
// Idempotent: keyed on stripe_subscription_id. Repeated webhook delivery does
// not create duplicate entitlements.
async function handleRc12Checkout(base44, session) {
  const sr = base44.asServiceRole;
  const userId = session.metadata?.user_id || session.client_reference_id;
  if (!userId) {
    console.error('[WEBHOOK-RC12] Missing user_id in session metadata — cannot attribute');
    return;
  }
  const stripeSubscriptionId = session.subscription;
  const productType = session.metadata?.product_type;
  const periodStart = session.current_period_start ? new Date(session.current_period_start * 1000).toISOString() : new Date().toISOString();
  const periodEnd = session.current_period_end ? new Date(session.current_period_end * 1000).toISOString() : null;

  if (productType === 'membership') {
    const configId = session.metadata?.membership_config_id;
    if (!configId) { console.error('[WEBHOOK-RC12] membership checkout missing membership_config_id'); return; }
    // RC16.5: Store the Stripe Price ID for commercial versioning — preserves
    // the historical price reference even if admin changes the config's price_id.
    const stripePriceId = session.metadata?.stripe_price_id || '';
    const existing = await sr.entities.MembershipSubscription.filter({ stripe_subscription_id: stripeSubscriptionId });
    const data = {
      owner_user_id: userId, membership_config_id: configId, status: 'active',
      billing_interval: session.metadata?.billing_interval === 'yearly' ? 'annual' : 'monthly',
      stripe_customer_id: session.customer, stripe_subscription_id: stripeSubscriptionId,
      stripe_price_id: stripePriceId,
      current_period_start: periodStart, current_period_end: periodEnd, cancel_at_period_end: false,
    };
    if (existing && existing.length > 0) await sr.entities.MembershipSubscription.update(existing[0].id, data);
    else await sr.entities.MembershipSubscription.create(data);
    console.info(`[WEBHOOK-RC12] Membership activated for user ${userId}`);
  } else if (productType === 'addon') {
    const productId = session.metadata?.add_on_product_id;
    if (!productId) { console.error('[WEBHOOK-RC12] addon checkout missing add_on_product_id'); return; }
    const product = await sr.entities.AddOnProduct.get(productId).catch(() => null);
    if (!product) { console.error('[WEBHOOK-RC12] AddOnProduct not found:', productId); return; }

    // RC16.7: one_period add-ons are one-time payments (no subscription).
    // Use checkout session ID for idempotency; derive period from membership.
    const billingMode = session.metadata?.addon_billing_mode || 'recurring';
    const isOnePeriod = billingMode === 'one_period';

    let addonPeriodStart = periodStart;
    let addonPeriodEnd = periodEnd;
    const purchaseMode = session.metadata?.purchase_mode || 'current';
    if (isOnePeriod) {
      // RC18.3.2 §B: Add-on period = ONE MONTHLY ENTITLEMENT WINDOW, not the
      // membership billing-period end. For annual members, the membership
      // current_period_end is the annual renewal date (e.g. 1 Sep 2027).
      // Setting the add-on's current_period_end to that date would give annual
      // members 12 months of add-on capacity from a single one-time purchase —
      // a commercial entitlement defect.
      // Instead, we compute the END of the current monthly entitlement window
      // using the same getMonthlyMessageWindow function that governs message
      // consumption. This ensures +50 Messages = +50 for ONE MONTH, regardless
      // of whether the member pays monthly or annually.
      try {
        const memSubs = await sr.entities.MembershipSubscription.filter({ owner_user_id: userId });
        const activeMem = memSubs
          .filter(s => ['active', 'trial', 'grace', 'past_due'].includes(s.status))
          .filter(s => !s.current_period_end || new Date() <= new Date(s.current_period_end))
          .sort((a, b) => new Date(b.current_period_end || 0).getTime() - new Date(a.current_period_end || 0).getTime())[0];
        if (activeMem?.current_period_start) {
          // RC18.3.4.1: Use the canonical anchor-preserving window calculation.
          // Both windowStart and windowEnd come from the original membership
          // anchor — no JS Date overflow drift on month-end anchors (29/30/31).
          const { windowStart, windowEnd: currentWindowEnd } = getMonthlyEntitlementWindow(activeMem.current_period_start, new Date());
          if (purchaseMode === 'next_period') {
            // RC18.3.3 §7: Renew for Next Period — the capacity must NOT
            // overlap the current add-on. effective_from = next monthly
            // boundary (currentWindowEnd); period_end = the boundary after
            // that. The AddOnSubscription is created with status 'scheduled'
            // and only contributes capacity once EntitlementService sees
            // now >= effective_from.
            // RC18.3.4.1: The boundary-after-next is computed by re-calling the
            // canonical function with now=currentWindowEnd — this walks from
            // the ORIGINAL anchor and returns the next window's end, preserving
            // the anchor day without drift.
            const { windowEnd: nextWindowEnd } = getMonthlyEntitlementWindow(activeMem.current_period_start, currentWindowEnd);
            addonPeriodStart = currentWindowEnd.toISOString();
            addonPeriodEnd = nextWindowEnd.toISOString();
          } else {
            addonPeriodStart = new Date().toISOString();
            addonPeriodEnd = currentWindowEnd.toISOString();
          }
        } else {
          // No membership period start — default to 1 month from now
          const now = new Date();
          addonPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
        }
      } catch (e) {
        console.info('[WEBHOOK-RC12] Could not resolve membership period for addon:', e.message);
      }
      // RC16.8 §41: Add-ons cannot outlive the Membership they extend. If no
      // active membership is found, the AddOnSubscription is NOT created.
      if (!addonPeriodEnd) {
        console.error(`[WEBHOOK-RC12] Add-on purchase for user ${userId} has no active membership — not creating standalone AddOnSubscription (§41)`);
        return;
      }
    }

    // Idempotency: one-period → checkout session ID; recurring → subscription ID.
    const existing = isOnePeriod
      ? await sr.entities.AddOnSubscription.filter({ stripe_checkout_session_id: session.id })
      : await sr.entities.AddOnSubscription.filter({ stripe_subscription_id: stripeSubscriptionId });

    // ── RC18.3.4 §7/§8: Webhook payment idempotency for next_period renewals ──
    // Even if two different Checkout Sessions somehow both get paid for the
    // SAME user + product + target period (concurrent race or abandoned-then-
    // retried checkout), only ONE scheduled AddOnSubscription is granted.
    // The renewal_intent_key is the deterministic identity.
    const renewalIntentKey = session.metadata?.renewal_intent_key || null;
    const targetPeriodStart = session.metadata?.target_period_start || null;
    let duplicateRenewalPayment = false;
    if (isOnePeriod && purchaseMode === 'next_period' && renewalIntentKey) {
      const existingByIntent = await sr.entities.AddOnSubscription
        .filter({ owner_user_id: userId, renewal_intent_key: renewalIntentKey })
        .catch(() => []);
      // A duplicate payment is one where the intent key matches BUT the
      // checkout session ID is different (meaning a second, separate payment).
      const conflictingGrant = existingByIntent.find(e => e.stripe_checkout_session_id !== session.id);
      if (conflictingGrant) {
        duplicateRenewalPayment = true;
        console.error(`[WEBHOOK-RC12] DUPLICATE RENEWAL PAYMENT detected: user=${userId} product=${productId} intent=${renewalIntentKey} existing_session=${conflictingGrant.stripe_checkout_session_id} new_session=${session.id}. Entitlement NOT duplicated. Payment requires refund review.`);
      }
    }

    // RC18.3.3 §7: next_period renewals are created as 'scheduled' — they do
    // NOT contribute capacity until effective_from passes (lazily promoted by
    // EntitlementService.isAddonCurrentlyEffective). current-period purchases
    // remain 'active' immediately.
    const initialStatus = (isOnePeriod && purchaseMode === 'next_period') ? 'scheduled' : 'active';
    const data = {
      owner_user_id: userId, add_on_product_id: productId, entitlement_type: product.entitlement_type,
      quantity: product.quantity, status: initialStatus, auto_renew: !isOnePeriod,
      purchase_mode: purchaseMode,
      effective_from: purchaseMode === 'next_period' ? addonPeriodStart : null,
      renewal_intent_key: renewalIntentKey || null,
      stripe_customer_id: session.customer,
      stripe_subscription_id: isOnePeriod ? null : stripeSubscriptionId,
      stripe_checkout_session_id: isOnePeriod ? session.id : null,
      current_period_start: addonPeriodStart, current_period_end: addonPeriodEnd,
      cancel_at_period_end: isOnePeriod,
    };

    if (duplicateRenewalPayment) {
      // RC18.3.4 §8: Do NOT silently grant duplicate capacity. Do NOT discard
      // the payment — audit it for admin/support/refund handling.
      try {
        await sr.entities.Notification.create({
          title: 'Duplicate renewal payment detected',
          body: `A duplicate renewal payment was received for user ${userId}, product ${productId}. Checkout session ${session.id}. The duplicate entitlement was NOT granted. Review for refund.`,
          type: 'addon_renewed',
          priority: 'high',
          user_id: userId,
          created_by_id: userId,
          action_label: 'View add-ons',
          action_url: '/subscription',
          deduplication_key: `duplicate_renewal:${session.id}`,
        });
      } catch (e) { console.info('[WEBHOOK-RC12] duplicate-payment audit notification skipped:', e.message); }
    } else if (existing && existing.length > 0) {
      await sr.entities.AddOnSubscription.update(existing[0].id, data);
    } else {
      await sr.entities.AddOnSubscription.create(data);
    }

    // RC18.3.3 §21 / RC18.3.4 §7: Send an ADDON_RENEWED confirmation notification
    // for next-period renewals. Deduplicate by renewal_intent_key (not session.id)
    // so a duplicate payment does not create a duplicate confirmation.
    if (purchaseMode === 'next_period' && !duplicateRenewalPayment) {
      try {
        const notifDedupKey = `addon_renewed:${renewalIntentKey || session.id}`;
        const existingNotif = await sr.entities.Notification.filter({ deduplication_key: notifDedupKey }).catch(() => []);
        if (!existingNotif || existingNotif.length === 0) {
          const prodLabel = `+${product.quantity} ${product.entitlement_type.replace('_units', '').replace('_', ' ')}`;
          const fmtDate = addonPeriodEnd ? new Date(addonPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the next period';
          await sr.entities.Notification.create({
            title: 'Add-on renewed',
            body: `Your ${prodLabel} renewal is secured. It becomes active on ${new Date(addonPeriodStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} and expires ${fmtDate}.`,
            type: 'addon_renewed',
            priority: 'low',
            user_id: userId,
            created_by_id: userId,
            action_label: 'View add-ons',
            action_url: '/subscription',
            deduplication_key: notifDedupKey,
          });
        }
      } catch (e) { console.info('[WEBHOOK-RC12] addon_renewed notification skipped:', e.message); }
    }
    console.info(`[WEBHOOK-RC12] Add-on ${productId} ${purchaseMode === 'next_period' ? (duplicateRenewalPayment ? 'DUPLICATE-PAYMENT-AUDITED' : 'scheduled') : 'activated'} for user ${userId} (+${product.quantity} ${product.entitlement_type}, ${billingMode})`);
  }
}

async function refreshRc12FromInvoice(base44, invoice) {
  const sr = base44.asServiceRole;
  const customerId = invoice.customer;
  if (!customerId) return;
  // Stripe subscription invoices carry the subscription billing window on the
  // recurring line item. Top-level invoice.period_start/period_end are not
  // reliable across API versions and caused MembershipSubscription periods to
  // remain stale while the legacy bridge advanced correctly.
  const recurringLine = invoice.lines?.data?.find((line:any) => line?.period?.start && line?.period?.end)
    || invoice.lines?.data?.[0];
  const rawPeriodStart = recurringLine?.period?.start || invoice.period_start || null;
  const rawPeriodEnd = recurringLine?.period?.end || invoice.period_end || null;
  const periodStart = rawPeriodStart ? new Date(rawPeriodStart * 1000).toISOString() : null;
  const periodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000).toISOString() : null;
  const memSubs = await sr.entities.MembershipSubscription.filter({ stripe_customer_id: customerId });
  for (const m of memSubs) {
    await sr.entities.MembershipSubscription.update(m.id, {
      status: 'active',
      current_period_start: periodStart || m.current_period_start,
      current_period_end: periodEnd || m.current_period_end,
    });
  }
  const subId = invoice.subscription;
  if (subId) {
    const aoSubs = await sr.entities.AddOnSubscription.filter({ stripe_subscription_id: subId });
    for (const a of aoSubs) {
      await sr.entities.AddOnSubscription.update(a.id, {
        status: 'active',
        current_period_start: periodStart || a.current_period_start,
        current_period_end: periodEnd || a.current_period_end,
      });
    }
  }
}

async function syncRc12FromSubscriptionUpdate(base44, subscription) {
  const sr = base44.asServiceRole;
  const subId = subscription.id;
  const cancelAtPeriodEnd = !!subscription.cancel_at_period_end;
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
  const memSubs = await sr.entities.MembershipSubscription.filter({ stripe_subscription_id: subId });
  for (const m of memSubs) {
    const update = { cancel_at_period_end: cancelAtPeriodEnd };
    if (periodEnd) update.current_period_end = periodEnd;
    if (subscription.status === 'past_due') update.status = 'past_due';
    else if (subscription.status === 'active' && m.status !== 'trial') update.status = 'active';
    await sr.entities.MembershipSubscription.update(m.id, update);
  }
  const aoSubs = await sr.entities.AddOnSubscription.filter({ stripe_subscription_id: subId });
  for (const a of aoSubs) {
    const update = { cancel_at_period_end: cancelAtPeriodEnd };
    if (periodEnd) update.current_period_end = periodEnd;
    if (subscription.status === 'past_due') update.status = 'past_due';
    else if (cancelAtPeriodEnd && a.status === 'active') update.status = 'cancel_at_period_end';
    else if (!cancelAtPeriodEnd && a.status === 'cancel_at_period_end') update.status = 'active';
    await sr.entities.AddOnSubscription.update(a.id, update);
  }
}

async function expireRc12FromSubscriptionDelete(base44, subscription) {
  const sr = base44.asServiceRole;
  const subId = subscription.id;
  const now = new Date().toISOString();
  const memSubs = await sr.entities.MembershipSubscription.filter({ stripe_subscription_id: subId });
  for (const m of memSubs) {
    await sr.entities.MembershipSubscription.update(m.id, { status: 'expired', cancel_at_period_end: false });
  }
  const aoSubs = await sr.entities.AddOnSubscription.filter({ stripe_subscription_id: subId });
  for (const a of aoSubs) {
    await sr.entities.AddOnSubscription.update(a.id, { status: 'expired', cancel_at_period_end: false, cancelled_at: now });
  }
  console.info(`[WEBHOOK-RC12] Expired subscription ${subId} (membership: ${memSubs.length}, addons: ${aoSubs.length})`);
}