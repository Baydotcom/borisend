import React from "react";
import { Users, Clock, CheckCircle, Wallet, TrendingUp, PoundSterling, Repeat, RefreshCw } from "lucide-react";

export default function ReferralStats({ stats }) {
  if (!stats) return null;

  const oneTimeCards = [
    { label: "Total referrals", value: stats.total_referrals || 0, icon: Users, color: "text-info" },
    { label: "Pending rewards", value: stats.pending_rewards || 0, icon: Clock, color: "text-warning" },
    { label: "Approved rewards", value: stats.approved_rewards || 0, icon: CheckCircle, color: "text-success" },
    { label: "Paid rewards", value: stats.paid_rewards || 0, icon: Wallet, color: "text-primary" },
    { label: "Available balance", value: `£${(stats.available_payout_balance || 0).toFixed(2)}`, icon: PoundSterling, color: "text-success" },
    { label: "Lifetime rewards", value: `£${(stats.lifetime_rewards_earned || 0).toFixed(2)}`, icon: TrendingUp, color: "text-info" },
  ];

  const commissionCards = [
    { label: "Commission rewards", value: stats.commission_rewards || 0, icon: Repeat, color: "text-primary" },
    { label: "Pending commission", value: stats.pending_commission || 0, icon: Clock, color: "text-warning" },
    { label: "Approved commission", value: stats.approved_commission || 0, icon: CheckCircle, color: "text-success" },
    { label: "Paid commission", value: stats.paid_commission || 0, icon: Wallet, color: "text-primary" },
    { label: "Lifetime commission", value: `£${(stats.lifetime_commission_earned || 0).toFixed(2)}`, icon: TrendingUp, color: "text-info" },
    { label: "Active earning refs", value: stats.active_commission_referrals || 0, icon: RefreshCw, color: "text-success" },
  ];

  const hasCommission = stats.commission_rewards > 0 || stats.lifetime_commission_earned > 0 || stats.active_commission_referrals > 0;

  const renderCard = ({ label, value, icon: Icon, color }) => (
    <div key={label} className="rounded-2xl bg-card border border-border/50 p-4">
      <Icon className={`w-4 h-4 mb-2 ${color}`} />
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {oneTimeCards.map(renderCard)}
      </div>

      {hasCommission && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Repeat className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Recurring commission</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {commissionCards.map(renderCard)}
          </div>
        </>
      )}
    </div>
  );
}