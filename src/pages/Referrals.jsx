import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import PageHeader from "@/components/layout/PageHeader";
import ReferralCodeCard from "@/components/referral/ReferralCodeCard";
import ReferralStats from "@/components/referral/ReferralStats";
import RewardHistoryList from "@/components/referral/RewardHistoryList";
import { Loader2, Gift, Info } from "lucide-react";
import PayoutService from "@/services/referral/PayoutService";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/common/PullToRefreshIndicator";

export default function Referrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestingPayout, setRequestingPayout] = useState(false);

  const load = async () => {
    try {
      const response = await base44.functions.invoke('getReferralDashboard', {});
      setData(response.data);
    } catch (e) {
      console.error("Failed to load referral dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const { pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(load);

  const handleRequestPayout = async () => {
    if (!data?.stats?.available_payout_balance || data.stats.available_payout_balance <= 0) return;
    setRequestingPayout(true);
    try {
      await PayoutService.requestPayout();
      await load();
    } catch (e) {
      console.error("Payout request failed:", e);
    } finally {
      setRequestingPayout(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div>
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />
      <PageHeader title="Referrals" subtitle="Invite friends, earn rewards" showHome />

      <div className="px-4 py-4 space-y-5">
        <ReferralCodeCard
          referralCode={data?.referral_code}
          referralLink={data?.referral_link}
        />

        <ReferralStats stats={data?.stats} />

        {/* How it works */}
        <div className="bg-muted/50 border border-border rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">How it works</p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                <li>1. Share your referral link with friends</li>
                <li>2. They sign up using your link</li>
                <li>3. You earn rewards when they take action</li>
                <li>4. Request a payout once rewards are approved</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Reward balance & payout */}
        {data?.stats?.available_payout_balance > 0 && (
          <div className="bg-card border border-border/50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-muted-foreground">Available payout balance</p>
                <p className="text-2xl font-bold">
                  £{(data.stats.available_payout_balance || 0).toFixed(2)}
                </p>
              </div>
              <button
                onClick={handleRequestPayout}
                disabled={requestingPayout || !data?.stats?.payout_eligible}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {requestingPayout ? "Requesting..." : data?.stats?.payout_eligible ? "Request payout" : `Minimum £${Number(data?.stats?.minimum_payout_amount || 50).toFixed(0)}`}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Payouts are processed manually. No external payment provider connected yet.
            </p>
          </div>
        )}

        {/* Reward history */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Reward history</h3>
          </div>
          <RewardHistoryList rewards={data?.rewards} />
        </div>
      </div>
    </div>
  );
}