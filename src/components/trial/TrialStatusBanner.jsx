import React from "react";
import { Clock, AlertCircle, Heart } from "lucide-react";

export default function TrialStatusBanner({ trialStatus }) {
  if (!trialStatus || !trialStatus.trial_active) return null;

  const daysRemaining = trialStatus.trial_days_remaining || 0;
  const isLastDay = trialStatus.trial_is_last_day;
  const trialEndsAt = trialStatus.trial_ends_at ? new Date(trialStatus.trial_ends_at) : null;

  const endDateStr = trialEndsAt
    ? trialEndsAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";

  // Don't show excessive warnings during first 6 days
  if (daysRemaining > 1) {
    return (
      <div className="mb-4 bg-accent border border-border rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-accent-foreground">
              {trialStatus.trial_offer_name || "Starter Trial"}
            </p>
            <p className="text-xs text-muted-foreground">
              {daysRemaining} days remaining {endDateStr && `· ends ${endDateStr}`}
            </p>
          </div>

        </div>
      </div>
    );
  }

  // Last day — more urgent
  return (
    <div className="block mb-4 bg-warning/10 border border-warning/30 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warning">
            Your trial ends today
          </p>
          <p className="text-xs text-muted-foreground">
Some features may pause when your trial ends.
          </p>
        </div>
        <Clock className="w-4 h-4 text-warning shrink-0" />
      </div>
    </div>
  );
}