import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { Loader2, CreditCard, CheckCircle2, Shield, AlertCircle } from "lucide-react";
import { calculateAnnualPricing, formatCurrency } from "@/lib/pricing";
import BillingDescriptorNotice from "@/components/billing/BillingDescriptorNotice";
import { getPlatformClientTag } from "@/lib/mobileBilling";

function PaymentForm({ onSuccess, onError, billingInterval }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    try {
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });

      if (stripeError) {
        onError(stripeError.message);
        setProcessing(false);
        return;
      }

      // Call backend to complete
      const res = await base44.functions.invoke("completeTrialPaymentMethod", {
        setup_intent_id: setupIntent.id,
        billing_interval: billingInterval,
        client_platform: getPlatformClientTag(),
      });

      if (res.data?.success) {
        onSuccess(res.data);
      } else {
        onError(res.data?.error || "Failed to schedule conversion. Please try again.");
      }
    } catch (err) {
      onError(err.message || "An unexpected error occurred");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-border p-3">
        <PaymentElement
          options={{
            layout: "tabs",
            defaultValues: { billingDetails: {} },
          }}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>You will not be charged now. Your subscription starts when the trial ends.</span>
      </div>
      <BillingDescriptorNotice />
      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full h-12 bg-primary hover:bg-primary/90 rounded-xl"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Securing payment method...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Add Payment Method
          </>
        )}
      </Button>
    </form>
  );
}

export default function TrialPaymentModal({ open, onClose, trialStatus }) {
  const [step, setStep] = useState("select"); // select | payment | success | error
  const [billingInterval, setBillingInterval] = useState("monthly");
  const [stripePromise, setStripePromise] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [setupIntentId, setSetupIntentId] = useState(null);
  const [error, setError] = useState("");
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [plan, setPlan] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  // Load Starter plan for pricing
  useEffect(() => {
    if (open && !plan) {
      base44.entities.SubscriptionPlan.filter({ is_active: true }, "sort_order", 20)
        .then((plans) => {
          const starter = plans.find((p) => p.name?.toLowerCase() === "starter");
          setPlan(starter || plans[0]);
        })
        .catch(() => {});
    }
  }, [open, plan]);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep("select");
      setError("");
      setStripePromise(null);
      setClientSecret(null);
      setConfirmation(null);
    }
  }, [open]);

  const handleStartPayment = async () => {
    setLoadingIntent(true);
    setError("");
    try {
      const res = await base44.functions.invoke("createTrialSetupIntent", { client_platform: getPlatformClientTag() });
      if (res.data?.client_secret) {
        setClientSecret(res.data.client_secret);
        setSetupIntentId(res.data.setup_intent_id);
        setStripePromise(loadStripe(res.data.publishable_key));
        setStep("payment");
      } else {
        setError(res.data?.error || "Could not start payment setup");
      }
    } catch (err) {
      setError(err.message || "Could not start payment setup");
    } finally {
      setLoadingIntent(false);
    }
  };

  const handleSuccess = (data) => {
    setConfirmation(data);
    setStep("success");
    try {
      base44.analytics.track({ eventName: "trial_payment_method_started", properties: {} });
    } catch (_) {}
  };

  const handleError = (msg) => {
    setError(msg);
    setStep("error");
  };

  const pricing = plan ? calculateAnnualPricing(plan.price, plan.annual_discount_percentage) : null;
  const trialEndsAt = trialStatus?.trial_ends_at ? new Date(trialStatus.trial_ends_at) : null;
  const endDateStr = trialEndsAt?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center text-lg font-heading">
                Your Starter Trial Ends Today
              </DialogTitle>
              <DialogDescription className="text-center">
                Add a payment method to continue using BoriSend without interruption.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {/* Billing interval selector */}
              <div className="space-y-2">
                <button
                  onClick={() => setBillingInterval("monthly")}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    billingInterval === "monthly"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Starter Monthly</p>
                      <p className="text-xs text-muted-foreground">Billed every month</p>
                    </div>
                    <p className="text-lg font-bold">
                      {plan ? formatCurrency(plan.price, plan.currency) : "£3.99"}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setBillingInterval("yearly")}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    billingInterval === "yearly"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Starter Annual</p>
                      <p className="text-xs text-emerald-600 font-medium">
                        {pricing ? `Save ${pricing.roundedDiscountPct}%` : "Save 17%"}
                      </p>
                    </div>
                    <div className="text-right">
                      {pricing && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatCurrency(pricing.originalAnnual, plan?.currency)}
                        </p>
                      )}
                      <p className="text-lg font-bold">
                        {plan?.annual_price ? formatCurrency(plan.annual_price, plan.currency) : "£39.99"}
                        <span className="text-xs font-normal text-muted-foreground">/yr</span>
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p>✓ You will not be charged now</p>
                <p>✓ Your subscription begins automatically on {endDateStr}</p>
                <p>✓ You can cancel before then at no cost</p>
              </div>

              <BillingDescriptorNotice className="mb-1" />
              <Button
                className="w-full h-12 bg-primary hover:bg-primary/90 rounded-xl"
                onClick={handleStartPayment}
                disabled={loadingIntent}
              >
                {loadingIntent ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add Payment Method
                  </>
                )}
              </Button>
              <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={onClose}>
                Later Today
              </Button>
            </div>
          </>
        )}

        {step === "payment" && stripePromise && clientSecret && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center text-lg font-heading">
                Add Payment Method
              </DialogTitle>
              <DialogDescription className="text-center">
                {billingInterval === "yearly" ? "Starter Annual" : "Starter Monthly"} ·{" "}
                {billingInterval === "yearly"
                  ? plan?.annual_price ? formatCurrency(plan.annual_price, plan.currency) + "/yr" : "£39.99/yr"
                  : plan ? formatCurrency(plan.price, plan.currency) + "/mo" : "£3.99/mo"}
              </DialogDescription>
            </DialogHeader>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm
                billingInterval={billingInterval}
                plan={plan}
                onSuccess={handleSuccess}
                onError={handleError}
              />
            </Elements>
          </>
        )}

        {step === "success" && confirmation && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <DialogTitle className="text-center text-lg font-heading">
                Payment method added
              </DialogTitle>
              <DialogDescription className="text-center">
                Your {confirmation.billing_interval === "yearly" ? "annual" : "monthly"} Starter subscription will begin automatically on {endDateStr}.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-primary/5 rounded-xl p-4 text-center space-y-1">
              <p className="text-sm font-semibold text-primary">
                {confirmation.currency === "GBP" ? "£" : ""}{confirmation.charge_amount}
                {confirmation.billing_interval === "yearly" ? "/yr" : "/mo"}
              </p>
              <p className="text-xs text-primary">
                You will be charged on {endDateStr} unless you cancel before then.
              </p>
            </div>
            <Button className="w-full h-12 bg-primary hover:bg-primary/90 rounded-xl" onClick={onClose}>
              Done
            </Button>
          </>
        )}

        {step === "error" && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
              </div>
              <DialogTitle className="text-center text-lg font-heading">
                Something went wrong
              </DialogTitle>
              <DialogDescription className="text-center">{error}</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={() => setStep("select")}
              >
                Try again
              </Button>
              <Button className="flex-1 h-12 rounded-xl" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}