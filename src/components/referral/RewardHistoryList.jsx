import React from "react";
import { Gift, ArrowUpRight } from "lucide-react";

const EVENT_LABELS = {
  signup: "Referred user signed up",
  trial_started: "Referred user started trial",
  became_paid: "Referred user became paid",
  remained_active: "Referred user remained active"
};

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-primary/15 text-primary"
};

const REWARD_TYPE_LABELS = {
  message_credits: "message credits",
  subscription_days: "subscription days",
  cash_payout: "cash payout",
  feature_unlock: "feature unlock"
};

export default function RewardHistoryList({ rewards }) {
  if (!rewards || rewards.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No rewards yet</p>
        <p className="text-xs mt-1">Earn rewards when your referrals take action</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rewards.map((reward) => (
        <div
          key={reward.id}
          className="bg-card border border-border/50 rounded-xl p-3 flex items-center justify-between"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {EVENT_LABELS[reward.event_type] || reward.event_type}
            </p>
            <p className="text-xs text-muted-foreground">
              {reward.amount} {REWARD_TYPE_LABELS[reward.reward_type] || reward.reward_type}
            </p>
          </div>
          <span
            className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize ${STATUS_STYLES[reward.status] || "bg-gray-100 text-gray-700"}`}
          >
            {reward.status}
          </span>
        </div>
      ))}
    </div>
  );
}