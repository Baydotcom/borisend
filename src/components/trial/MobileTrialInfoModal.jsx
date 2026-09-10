import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

/**
 * MobileTrialInfoModal — Informational modal shown on packaged mobile apps
 * instead of the Stripe-based TrialPaymentModal.
 *
 * No payment links, no card entry, no Stripe elements.
 * No external purchase direction — neutral status information only.
 */
export default function MobileTrialInfoModal({ open, onClose, trialStatus }) {
  const trialEndsAt = trialStatus?.trial_ends_at ? new Date(trialStatus.trial_ends_at) : null;
  const endDateStr = trialEndsAt?.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-lg font-heading">
            Your Starter Trial Ends Today
          </DialogTitle>
          <DialogDescription className="text-center">
            Some features may pause when your trial ends.
          </DialogDescription>
        </DialogHeader>

        {endDateStr && (
          <p className="text-xs text-center text-muted-foreground">
            Trial ends {endDateStr}
          </p>
        )}

        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-xs text-amber-700">
            Your account and saved information will remain available.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={onClose}>
            Not now
          </Button>
          <Button className="flex-1 h-12 rounded-xl" onClick={onClose}>
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}