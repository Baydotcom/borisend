import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import { Lock, AlertTriangle } from "lucide-react";
import { calculateAnnualPricing, formatCurrency } from "@/lib/pricing";

/**
 * RC18.3.1 §15 — LEGACY READ-ONLY.
 * This page is retained for historical migration visibility only.
 * The canonical commercial authority is ManageCommercial (MembershipConfiguration,
 * AddOnProduct, AdminEntitlementAdjustment, TrialConfiguration).
 * No create/edit/delete/sync operations are permitted here.
 */
export default function ManagePlans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      if (me.role !== "admin" && me.role !== "super_admin") { navigate("/"); return; }
      const p = await base44.entities.SubscriptionPlan.list("sort_order", 20);
      setPlans(p);
      setLoading(false);
    };
    load();
  }, [navigate]);

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Legacy Billing Console"
        subtitle="Read-only — historical migration data"
      />

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
        {/* READ-ONLY / LEGACY banner */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-400/50 rounded-2xl p-4 mb-3">
          <div className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Read-only — Legacy commercial data</p>
              <p className="text-xs text-muted-foreground mb-2">
                This console displays historical SubscriptionPlan records from the pre-RC12 billing model.
                These plans are retained for migration visibility and cannot be edited, created, or deleted.
                BoriSend 2.0 uses a single membership with five capacity dimensions managed in Commercial Configuration.
              </p>
              <a href="/admin/commercial" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Go to Commercial Configuration →
              </a>
            </div>
          </div>
        </div>

        {plans.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No legacy plan records.
          </div>
        )}

        {plans.map((plan) => {
          const pricing = calculateAnnualPricing(plan.price, plan.annual_discount_percentage);
          const isFree = plan.price === 0;
          return (
            <div key={plan.id} className="bg-card border border-border/50 rounded-xl p-4 opacity-75">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm">{plan.name}</h4>
                    {plan.is_popular && <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">Popular</span>}
                    {!plan.is_active && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Inactive</span>}
                    {!isFree && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        plan.stripe_sync_status === 'synced' ? 'bg-emerald-100 text-emerald-700' :
                        plan.stripe_sync_status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {plan.stripe_sync_status === 'synced' ? '✓ Stripe synced' :
                         plan.stripe_sync_status === 'error' ? '⚠ Sync error' :
                         '○ Not synced'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {plan.monthly_message_limit >= 9999 ? "Unlimited" : plan.monthly_message_limit} messages · {plan.max_campaigns >= 999999 ? "Unlimited" : (plan.max_campaigns || 1)} plans
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="font-semibold">{formatCurrency(plan.price, plan.currency)}/mo</span>
                    {plan.supports_annual && plan.annual_price && (
                      <span className="text-muted-foreground">
                        <span className="line-through">{formatCurrency(pricing.originalAnnual, plan.currency)}</span>
                        {" "}<span className="font-semibold text-primary">{formatCurrency(plan.annual_price, plan.currency)}/yr</span>
                        {" "}<span className="text-emerald-600">Save {pricing.roundedDiscountPct}%</span>
                      </span>
                    )}
                    {!plan.supports_annual && !isFree && <span className="text-muted-foreground">Monthly only</span>}
                  </div>
                  {plan.stripe_product_id && (
                    <div className="flex gap-2 mt-1.5 text-[10px] font-mono text-muted-foreground/60">
                      <span>prod: {plan.stripe_product_id.substring(0, 14)}…</span>
                      {plan.stripe_price_id_monthly && <span>mo: {plan.stripe_price_id_monthly.substring(0, 14)}…</span>}
                      {plan.stripe_price_id_annual && <span>yr: {plan.stripe_price_id_annual.substring(0, 14)}…</span>}
                    </div>
                  )}
                </div>
              </div>
              {plan.features && plan.features.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {plan.features.map((f, i) => (
                    <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{f}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}