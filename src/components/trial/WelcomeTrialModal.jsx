import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

export default function WelcomeTrialModal({ open, onClose, trialInfo }) {
  const trialEndsAt = trialInfo?.trial_ends_at ? new Date(trialInfo.trial_ends_at) : null;
  const endDateStr = trialEndsAt
    ? trialEndsAt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
              <Heart className="w-8 h-8 text-white" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl font-heading">
            Welcome to BoriSend
          </DialogTitle>
          <DialogDescription className="text-center">
            Your {trialInfo?.trial_offer_name || "7-Day Starter Trial"} has started.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground text-center">
            You can use all {trialInfo?.trial_plan_name || "Starter"} features until
          </p>
          <p className="text-sm font-semibold text-center text-primary">
            {endDateStr}
          </p>
          <div className="bg-primary/5 rounded-xl p-3 text-center">
            <p className="text-xs text-primary">
              {trialInfo?.included_message_units ?? 5} messages · {trialInfo?.included_plan_units ?? 1} Communication Plans · {trialInfo?.included_recipient_units ?? 2} people
            </p>
          </div>
        </div>
        <Button
          className="w-full h-12 bg-primary hover:bg-primary/90 rounded-xl"
          onClick={onClose}
        >
          Start Using BoriSend
        </Button>
      </DialogContent>
    </Dialog>
  );
}