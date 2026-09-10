import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Plus, AlertTriangle, CalendarClock, RefreshCw, CheckCircle2 } from "lucide-react";
import { isMobileBillingRestricted, getPlatformClientTag } from "@/lib/mobileBilling";

const typeLabel = (t) => {
  const map = {
    communication_plan_units: "Communication Plans",
    recipient_units: "Recipients",
    message_units: "Generated Messages",
    message_passes: "Message Passes",
    smart_message_units: "Smart Messages",
  };
  return map[t] || t;
};

const fmtDate = (iso) => {
  if (!iso) return "period end";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  } catch { return "period end"; }
};

export default function MembershipAddOns() {
  const [configs, setConfigs] = useState([]);
  const [addOnProducts, setAddOnProducts] = useState([]);
  const [cap, setCap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState("monthly");
  const [addonTab, setAddonTab] = useState("communication_plan_units");
  const [checkingOut, setCheckingOut] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [renewProductId, setRenewProductId] = useState(null);
  const mobileRestricted = isMobileBillingRestricted();

  const load = useCallback(async () => {
    try {
      const [cfgs, aops, capRes] = await Promise.all([
        base44.entities.MembershipConfiguration.list("display_order", 20),
        base44.entities.AddOnProduct.filter({ is_active: true }, "display_order", 50),
        base44.functions.invoke("getCapacityStatus", {}),
      ]);
      setConfigs(cfgs || []);
      setAddOnProducts(aops || []);
      setCap(capRes.data);
    } catch (e) { /* non-blocking */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // RC16.1 §22 + RC18.3.3 §5: deep-link pre-selection.
  // /subscription?addon={product_id} selects the matching category tab.
  // /subscription?addon={product_id}&mode=renew opens the renew sheet for that product.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addon = params.get("addon");
    const mode = params.get("mode");
    if (!addon) {
      const tab = params.get("tab");
      if (tab === "messages") setAddonTab("message_units");
      else if (tab === "recipients") setAddonTab("recipient_units");
      else if (tab === "plans") setAddonTab("communication_plan_units");
      return;
    }
    if (mode === "renew") setRenewProductId(addon);
    // Select the category tab matching this product.
    const prod = addOnProducts.find(p => p.id === addon);
    if (prod) setAddonTab(prod.entitlement_type);
  }, [addOnProducts]);

  const iframeBlocked = () => {
    if (window.self !== window.top) {
      toast({ title: "Checkout unavailable", description: "Please open the app in a new tab to complete checkout." });
      return true;
    }
    return false;
  };

  const handleMembershipCheckout = async (configId) => {
    if (mobileRestricted) { toast({ title: "Unavailable", description: "Subscription management is unavailable on this build." }); return; }
    if (iframeBlocked()) return;
    try {
      setCheckingOut(`membership-${configId}`);
      const res = await base44.functions.invoke("createMembershipCheckoutSession", { membership_config_id: configId, billing_interval: billingInterval, client_platform: getPlatformClientTag() });
      if (res.data?.url) window.location.href = res.data.url;
      else toast({ title: "Error", description: res.data?.error || "Could not start checkout." });
    } catch (e) { toast({ title: "Error", description: e.message }); } finally { setCheckingOut(null); }
  };

  // RC18.3.3 §6: purchase_mode distinguishes Buy More Now (current) from
  // Renew for Next Period (next_period). The backend enforces duplicate
  // prevention for next_period renewals (§8).
  const handleAddOnCheckout = async (productId, mode = "current") => {
    if (mobileRestricted) { toast({ title: "Unavailable", description: "Add-on purchase is unavailable on this build." }); return; }
    if (iframeBlocked()) return;
    if (!canBuyAddons) { toast({ title: "Membership required", description: "Subscribe to BoriSend Membership to add more capacity." }); return; }
    try {
      setCheckingOut(`addon-${productId}-${mode}`);
      const res = await base44.functions.invoke("createAddonCheckoutSession", { add_on_product_id: productId, purchase_mode: mode, client_platform: getPlatformClientTag() });
      if (res.data?.url) window.location.href = res.data.url;
      else if (res.data?.already_renewed) {
        toast({ title: "Already renewed", description: res.data.error || "You have already renewed this add-on for the next period." });
      } else if (res.data?.membership_required) {
        toast({ title: "Membership required", description: res.data.error || "Subscribe to BoriSend Membership to add more capacity." });
      } else toast({ title: "Error", description: res.data?.error || "Could not start checkout." });
    } catch (e) {
      toast({ title: "Membership required", description: "Subscribe to BoriSend Membership to add more capacity." });
    } finally { setCheckingOut(null); }
  };

  const handleCancelAddOn = async (addonId) => {
    if (!confirm("Cancel renewal? The add-on stays active until the end of its paid period, then its capacity expires.")) return;
    try {
      setCancelling(addonId);
      const res = await base44.functions.invoke("cancelAddOn", { add_on_subscription_id: addonId });
      if (res.data?.success) { toast({ title: "Renewal cancelled", description: "This add-on will expire at period end." }); load(); }
      else toast({ title: "Error", description: res.data?.error || "Could not cancel." });
    } catch (e) { toast({ title: "Error", description: e.message }); } finally { setCancelling(null); }
  };

  const activeAddons = cap?.addons || [];
  const membershipStatus = cap?.membershipStatus;

  // RC18.3.3 §8/§10: Group active add-ons by product to show current + scheduled
  // renewal together. For each active add-on, check whether a scheduled renewal
  // exists for the same product. Hooks must run before any early return.
  const addonsByProduct = useMemo(() => {
    const map = new Map();
    for (const a of activeAddons) {
      if (!map.has(a.add_on_product_id)) map.set(a.add_on_product_id, []);
      map.get(a.add_on_product_id).push(a);
    }
    return map;
  }, [activeAddons]);

  const hasScheduledRenewal = useCallback((productId) => {
    const list = addonsByProduct.get(productId) || [];
    return list.some(a => a.status === "scheduled");
  }, [addonsByProduct]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const config = configs.find(c => c.is_active) || configs[0];
  const canBuyAddons = membershipStatus === 'active' || membershipStatus === 'grace';
  const priceLabel = (val, suffix) => (val != null ? `£${val}${suffix}` : null);

  return (
    <div className="space-y-5">
      {/* Over-capacity banner (RC18.3.3 §12: no data deletion) */}
      {(cap?.plan?.isOverCapacity || cap?.recipient?.isOverCapacity) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-2 dark:bg-amber-950/40 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            <p className="font-semibold mb-0.5">You're over capacity</p>
            <p>Your data is preserved. Add more capacity or deactivate some plans/recipients to resume full operation.</p>
          </div>
        </div>
      )}

      {/* Membership */}
      {config ? (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold">{config.display_name || "BoriSend Membership"}</h3>
              <p className="text-xs text-muted-foreground">{config.included_plan_units} Plans · {config.included_recipient_units} Recipients · {config.included_message_units || 0} Generated Messages/mo · {config.included_message_passes ?? 5} Passes · {config.included_smart_message_units ?? 30} Smart Messages</p>
            </div>
            {membershipStatus === "active" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Active</span>}
            {membershipStatus === "trial" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">Trial</span>}
          </div>
          <div className="inline-flex items-center bg-muted rounded-full p-1 mb-4">
            <button onClick={() => setBillingInterval("monthly")} className={`px-3 py-1 text-xs font-medium rounded-full ${billingInterval === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Monthly</button>
            {config.annual_price != null && (
              <button onClick={() => setBillingInterval("yearly")} className={`px-3 py-1 text-xs font-medium rounded-full ${billingInterval === "yearly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Annual</button>
            )}
          </div>
          <div className="mb-3">
            <span className="text-2xl font-bold">{priceLabel(billingInterval === "yearly" ? config.annual_price : config.monthly_price, billingInterval === "yearly" ? "/yr" : "/mo") || "—"}</span>
          </div>
          {!mobileRestricted && (
            <Button className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90" disabled={checkingOut === `membership-${config.id}` || !config.monthly_stripe_price_id} onClick={() => handleMembershipCheckout(config.id)}>
              {checkingOut === `membership-${config.id}` ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {!config.monthly_stripe_price_id ? "Purchasing will be available shortly." : (membershipStatus === "active" ? "Manage" : "Subscribe")}
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-2xl p-5 text-center text-sm text-muted-foreground">BoriSend membership will be available shortly.</div>
      )}

      {/* Active add-ons — RC18.3.3 §2/§10: show ACTUAL expiry date from authoritative record */}
      {activeAddons.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your add-ons</h4>
          {activeAddons.map(a => {
            const isScheduled = a.status === "scheduled";
            const alreadyRenewed = !isScheduled && hasScheduledRenewal(a.add_on_product_id);
            return (
              <div key={a.id} className="bg-card border border-border/50 rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">+{a.quantity} {typeLabel(a.entitlement_type)}</p>
                  {isScheduled ? (
                    <p className="text-[11px] text-success flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Renewed for {fmtDate(a.effective_from)} – {fmtDate(a.period_end)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      {a.auto_renew === false
                        ? `Expires ${fmtDate(a.period_end)}`
                        : a.status === "cancel_at_period_end"
                          ? `Ends ${fmtDate(a.period_end)}`
                          : `Renews ${fmtDate(a.period_end)}`}
                    </p>
                  )}
                  {alreadyRenewed && (
                    <p className="text-[10px] text-success flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Renewed for next period
                    </p>
                  )}
                </div>
                {!isScheduled && !alreadyRenewed && a.auto_renew === false && !mobileRestricted && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={checkingOut === `addon-${a.add_on_product_id}-next_period`}
                    onClick={() => handleAddOnCheckout(a.add_on_product_id, "next_period")}
                    className="shrink-0"
                  >
                    {checkingOut === `addon-${a.add_on_product_id}-next_period`
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                    Renew
                  </Button>
                )}
                {a.auto_renew !== false && a.status === "active" && !mobileRestricted && (
                  <Button variant="outline" size="sm" disabled={cancelling === a.id} onClick={() => handleCancelAddOn(a.id)}>
                    {cancelling === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancel renewal"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add-on products — compact catalogue with category tabs */}
      {addOnProducts.length > 0 && !mobileRestricted && (
        <div className="space-y-3">
          {!canBuyAddons && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
              <p className="text-sm font-semibold text-foreground">Subscribe to BoriSend Membership to add more capacity</p>
              <p className="text-xs text-muted-foreground mt-1">Add-ons extend your Membership — you need an active paid membership to purchase capacity add-ons. {membershipStatus === 'trial' ? 'Trial users should subscribe first.' : 'Choose a membership above to get started.'}</p>
            </div>
          )}
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Need more capacity? Add only what you need.</h4>
          <p className="text-[11px] text-muted-foreground -mt-1">Extra capacity lasts until your current monthly allowance resets, then expires — no automatic renewal.</p>
          <div className="inline-flex items-center bg-muted rounded-full p-1 w-full">
            {[
              { key: "communication_plan_units", label: "Plans" },
              { key: "recipient_units", label: "Recipients" },
              { key: "message_units", label: "Generated" },
              { key: "smart_message_units", label: "Smart" },
            ].map(tab => {
              const count = addOnProducts.filter(p => p.entitlement_type === tab.key).length;
              if (count === 0) return null;
              return (
                <button key={tab.key} onClick={() => setAddonTab(tab.key)}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${addonTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            {addOnProducts.filter(p => p.entitlement_type === addonTab).map(p => {
              const isRecurring = p.billing_mode === "recurring";
              const renewed = hasScheduledRenewal(p.id);
              const isRenewTarget = renewProductId === p.id;
              return (
                <div key={p.id} className={`bg-card border rounded-xl p-3.5 flex items-center justify-between gap-2 ${isRenewTarget ? "border-primary/60 ring-1 ring-primary/30" : "border-border/50"}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">+{p.quantity} {typeLabel(p.entitlement_type)}</p>
                    <p className="text-[11px] text-muted-foreground">{p.display_name}{p.monthly_price ? ` · £${p.monthly_price}` : ""}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {isRecurring ? "Recurring — renews each period (cancel anytime)." : "One-time — lasts until your monthly allowance resets."}
                    </p>
                    {renewed && (
                      <p className="text-[10px] text-success flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Renewed for next period
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {/* RC18.3.3 §6: Renew for Next Period (disabled if already renewed) */}
                    {!isRecurring && !renewed && canBuyAddons && p.monthly_stripe_price_id && (
                      <Button size="sm" variant="outline" disabled={checkingOut === `addon-${p.id}-next_period`} onClick={() => handleAddOnCheckout(p.id, "next_period")}>
                        {checkingOut === `addon-${p.id}-next_period` ? <Loader2 className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                        Renew
                      </Button>
                    )}
                    {/* Buy More Now — always allowed (legitimate stacking, §9) */}
                    <Button size="sm" disabled={checkingOut === `addon-${p.id}-current` || !p.monthly_stripe_price_id || !canBuyAddons} onClick={() => handleAddOnCheckout(p.id, "current")} className="bg-primary hover:bg-primary/90">
                      {checkingOut === `addon-${p.id}-current` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                      {!p.monthly_stripe_price_id ? "Soon" : !canBuyAddons ? "Members only" : "Add"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {addOnProducts.filter(p => p.entitlement_type === addonTab).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No options in this category.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}