import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check, RefreshCw, Apple } from "lucide-react";
import AppleIAPService from "@/services/mobile/AppleIAPService";
import { toast } from "@/components/ui/use-toast";

/**
 * RC20.3 — Apple IAP Purchase Card
 *
 * Shown on iOS native when:
 *   - Apple IAP is available (native plugin exists)
 *   - User does NOT have an active paid membership
 *
 * Shows the two Apple auto-renewable subscription options:
 *   £4.99/month
 *   £49.99/year
 *
 * Also provides Restore Purchases.
 *
 * Does NOT show Stripe checkout — Apple IAP is the in-app purchase route.
 * Does NOT show external "buy on website" CTA (App Store policy).
 *
 * @param {Function} onPurchaseSuccess — called after successful verification to reload state
 */
export default function ApplePurchaseCard({ onPurchaseSuccess }) {
  const [purchasing, setPurchasing] = useState(null); // 'monthly' | 'annual' | null
  const [restoring, setRestoring] = useState(false);

  const handlePurchase = async (interval) => {
    setPurchasing(interval);
    try {
      const result = interval === "annual"
        ? await AppleIAPService.purchaseAnnual()
        : await AppleIAPService.purchaseMonthly();

      if (result.cancelled) {
        // user dismissed the StoreKit sheet — no toast needed
      } else if (result.success) {
        toast({ title: "Welcome to BoriSend!", description: "Your subscription is now active." });
        onPurchaseSuccess?.();
      } else if (result.conflict) {
        toast({
          title: "Subscription linked elsewhere",
          description: "This Apple subscription is already linked to another BoriSend account.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Purchase incomplete",
          description: result.error || "Could not complete the purchase. Please try again.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Purchase failed",
        description: e.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await AppleIAPService.restorePurchases();
      if (result.success && result.restored > 0) {
        toast({ title: "Purchases restored", description: "Your subscription is now active." });
        onPurchaseSuccess?.();
      } else if (result.conflict) {
        toast({
          title: "Subscription linked elsewhere",
          description: "This Apple subscription is already linked to another BoriSend account.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "No purchases found",
          description: result.message || "There are no previous Apple purchases to restore.",
        });
      }
    } catch (e) {
      toast({
        title: "Restore failed",
        description: e.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-3 pb-4">
      {/* Monthly */}
      <div className="relative rounded-2xl border border-primary/40 bg-card p-5">
        <div className="absolute -top-2.5 left-4 px-2.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-semibold rounded-full">Monthly</div>
        <div className="flex items-start justify-between mb-3 mt-1">
          <div>
            <h4 className="font-semibold flex items-center gap-2">
              <Apple className="w-4 h-4" />
              BoriSend Membership
            </h4>
            <p className="text-xs text-muted-foreground">Auto-renews monthly. Cancel anytime.</p>
          </div>
          <p className="text-xl font-bold">£4.99<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
        </div>
        <ul className="space-y-1.5 mb-4">
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />3 Communication Plans</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />10 Recipients</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />20 Generated Messages / month</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />5 Message Passes / month</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />30 Smart Messages / month</li>
        </ul>
        <Button
          className="w-full h-10 rounded-xl text-sm bg-primary hover:bg-primary/90"
          disabled={purchasing !== null}
          onClick={() => handlePurchase("monthly")}
        >
          {purchasing === "monthly" ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : "Subscribe £4.99/mo"}
        </Button>
      </div>

      {/* Annual */}
      <div className="relative rounded-2xl border border-primary/40 bg-card p-5">
        <div className="absolute -top-2.5 left-4 px-2.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-semibold rounded-full">Annual</div>
        <div className="flex items-start justify-between mb-3 mt-1">
          <div>
            <h4 className="font-semibold flex items-center gap-2">
              <Apple className="w-4 h-4" />
              BoriSend Membership
            </h4>
            <p className="text-xs text-muted-foreground">Auto-renews yearly. Cancel anytime.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground line-through">£59.88</p>
            <p className="text-xl font-bold">£49.99<span className="text-xs font-normal text-muted-foreground">/yr</span></p>
            <span className="inline-block text-[10px] text-success font-semibold">Save 17%</span>
          </div>
        </div>
        <ul className="space-y-1.5 mb-4">
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />3 Communication Plans</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />10 Recipients</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />20 Generated Messages / month</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />5 Message Passes / month</li>
          <li className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary shrink-0" />30 Smart Messages / month</li>
        </ul>
        <Button
          className="w-full h-10 rounded-xl text-sm bg-primary hover:bg-primary/90"
          disabled={purchasing !== null}
          onClick={() => handlePurchase("annual")}
        >
          {purchasing === "annual" ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : "Subscribe £49.99/yr"}
        </Button>
      </div>

      {/* Restore Purchases */}
      <button
        onClick={handleRestore}
        disabled={restoring || purchasing !== null}
        className="w-full text-center text-sm text-primary hover:underline disabled:opacity-50 py-2 flex items-center justify-center gap-1.5"
      >
        {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Restore Purchases
      </button>

      <p className="text-[11px] text-muted-foreground text-center px-4">
        Subscription auto-renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your Apple Account settings.
      </p>
    </div>
  );
}