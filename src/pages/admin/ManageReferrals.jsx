import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import { Loader2, Users, Gift, Wallet, AlertTriangle, Settings as SettingsIcon } from "lucide-react";
import PayoutService from "@/services/referral/PayoutService";
import AdminConfigEditor from "@/components/referral/AdminConfigEditor";
import CommissionConfigEditor from "@/components/referral/CommissionConfigEditor";
import { Search, Repeat } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-primary/15 text-primary",
  attributed: "bg-blue-100 text-blue-700",
  qualified: "bg-indigo-100 text-indigo-700",
  rewarded: "bg-emerald-100 text-emerald-700",
  requested: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
  free: "bg-gray-100 text-gray-700"
};

const TABS = [
  { key: "attributions", label: "Attributions", icon: Users },
  { key: "rewards", label: "Rewards", icon: Gift },
  { key: "payouts", label: "Payouts", icon: Wallet },
  { key: "commission", label: "Commission", icon: Repeat },
  { key: "config", label: "Config", icon: SettingsIcon }
];

export default function ManageReferrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("attributions");
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState("");
  const [rewardStatusFilter, setRewardStatusFilter] = useState("all");
  const [fraudFilter, setFraudFilter] = useState("all");
  const [referralStatusFilter, setReferralStatusFilter] = useState("all");

  const load = async () => {
    try {
      const response = await base44.functions.invoke('adminGetReferrals', {});
      setData(response.data);
    } catch (e) {
      console.error("Failed to load referral admin data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handlePayoutAction = async (payoutId, action) => {
    setActionLoading(`${payoutId}_${action}`);
    try {
      if (action === "approve") await PayoutService.adminApprovePayout(payoutId, "Approved by admin");
      if (action === "reject") await PayoutService.adminRejectPayout(payoutId, "Rejected by admin");
      if (action === "mark_paid") {
        const paymentReference = window.prompt("Enter the external payment reference before marking this payout paid:");
        if (!paymentReference?.trim()) {
          setActionLoading(null);
          return;
        }
        await PayoutService.adminMarkPayoutPaid(payoutId, "Settlement completed and reference recorded", paymentReference.trim());
      }
      toast({ title: `Payout ${action}d successfully` });
      await load();
    } catch (e) {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  const summary = data?.summary || {};

  // Apply search and filters
  const searchLower = search.toLowerCase();
  const matchesSearch = (text) => !searchLower || (text || "").toLowerCase().includes(searchLower);

  const filteredAttributions = (data?.attributions || []).filter(a => {
    if (!matchesSearch(a.referred_email) && !matchesSearch(a.referral_code) &&
        !matchesSearch(a.referrer_user_id) && !matchesSearch(a.referred_user_id)) return false;
    if (fraudFilter === "flagged" && !a.fraud_flag) return false;
    if (fraudFilter === "clean" && a.fraud_flag) return false;
    if (referralStatusFilter !== "all" && a.status !== referralStatusFilter) return false;
    return true;
  });

  const filteredRewards = (data?.rewards || []).filter(r => {
    if (!matchesSearch(r.user_id) && !matchesSearch(r.referred_user_id) &&
        !matchesSearch(r.event_type) && !matchesSearch(r.reward_type)) return false;
    if (rewardStatusFilter !== "all" && r.status !== rewardStatusFilter) return false;
    return true;
  });

  const filteredPayouts = (data?.payouts || []).filter(p => {
    if (!matchesSearch(p.user_email) && !matchesSearch(p.user_id)) return false;
    if (rewardStatusFilter !== "all" && p.status !== rewardStatusFilter) return false;
    return true;
  });

  const showFilters = tab === "attributions" || tab === "rewards" || tab === "payouts";

  const commissionSummary = data?.commission_summary || {};
  const commissionConfig = data?.commission_config || null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <AdminPageHeader title="Manage Referrals" />

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 mt-4 mb-3">
          <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{summary.total_attributions || 0}</p>
            <p className="text-[10px] text-muted-foreground">Attributions</p>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{summary.pending_rewards || 0}</p>
            <p className="text-[10px] text-muted-foreground">Pending rewards</p>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-red-600">{summary.flagged_attributions || 0}</p>
            <p className="text-[10px] text-muted-foreground">Fraud flagged</p>
          </div>
        </div>

        {/* Commission summary */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-violet-600">{commissionSummary.total_commission_rewards || 0}</p>
            <p className="text-[10px] text-muted-foreground">Commission rewards</p>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-teal-600">{commissionSummary.active_commission_referrals || 0}</p>
            <p className="text-[10px] text-muted-foreground">Active earning refs</p>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-indigo-600">£{(commissionSummary.total_commission_liability || 0).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">Commission liability</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-muted/50 rounded-xl p-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === key ? "bg-background shadow-sm text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Search & filters */}
        {showFilters && (
          <div className="space-y-2 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by email, code, user ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {tab === "attributions" && (
                <>
                  <select
                    value={referralStatusFilter}
                    onChange={e => setReferralStatusFilter(e.target.value)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="all">All statuses</option>
                    <option value="attributed">Attributed</option>
                    <option value="qualified">Qualified</option>
                    <option value="rewarded">Rewarded</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <select
                    value={fraudFilter}
                    onChange={e => setFraudFilter(e.target.value)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="all">All fraud</option>
                    <option value="flagged">Flagged only</option>
                    <option value="clean">Not flagged</option>
                  </select>
                </>
              )}
              {(tab === "rewards" || tab === "payouts") && (
                <select
                  value={rewardStatusFilter}
                  onChange={e => setRewardStatusFilter(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="paid">Paid</option>
                  <option value="requested">Requested</option>
                </select>
              )}
            </div>
          </div>
        )}

        {/* Tab content */}
        {tab === "attributions" && (
          <div className="space-y-2">
            {filteredAttributions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No attributions found</p>
            ) : (
              filteredAttributions.map(a => (
                <div key={a.id} className="bg-card border border-border/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{a.referred_email || a.referred_user_id}</p>
                    <div className="flex gap-1">
                      {a.fraud_flag && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Flagged
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[a.status] || "bg-gray-100"}`}>
                        {a.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Code: {a.referral_code}</p>
                  <p className="text-xs text-muted-foreground">Referred: {a.referred_user_id}</p>
                  <p className="text-xs text-muted-foreground">Referrer: {a.referrer_user_id}</p>
                  {a.fraud_reason && (
                    <p className="text-xs text-red-600 mt-1">Reason: {a.fraud_reason}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "rewards" && (
          <div className="space-y-2">
            {filteredRewards.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No rewards found</p>
            ) : (
              filteredRewards.map(r => (
                <div key={r.id} className="bg-card border border-border/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium capitalize">{r.event_type?.replace(/_/g, " ")}</p>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize ${STATUS_STYLES[r.status] || "bg-gray-100"}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    £{(r.amount || 0).toFixed(2)} {r.reward_type?.replace(/_/g, " ")} • User: {r.user_id}
                  </p>
                  {r.event_type === 'subscription_commission' && (
                    <div className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">
                        Cycle #{r.commission_cycle_number} • {r.commission_duration_rule?.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Payment: £{(r.payment_amount || 0).toFixed(2)} ({r.billing_period}) • Ref: {r.payment_reference?.slice(0, 20) || 'N/A'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.commission_type === 'percentage'
                          ? `${r.commission_rate}% of payment`
                          : `Fixed £${r.commission_rate}`}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "payouts" && (
          <div className="space-y-2">
            {filteredPayouts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No payout requests found</p>
            ) : (
              filteredPayouts.map(p => (
                <div key={p.id} className="bg-card border border-border/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">£{(p.amount || 0).toFixed(2)} {p.currency}</p>
                      <p className="text-xs text-muted-foreground">{p.user_email || p.user_id}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize ${STATUS_STYLES[p.status] || "bg-gray-100"}`}>
                      {p.status}
                    </span>
                  </div>
                  {p.status === "requested" && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handlePayoutAction(p.id, "approve")}
                        disabled={actionLoading === `${p.id}_approve`}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handlePayoutAction(p.id, "reject")}
                        disabled={actionLoading === `${p.id}_reject`}
                        className="flex-1 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {p.status === "approved" && (
                    <button
                      onClick={() => handlePayoutAction(p.id, "mark_paid")}
                      disabled={actionLoading === `${p.id}_mark_paid`}
                      className="w-full py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/15 mt-2"
                    >
                      Mark as paid
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "commission" && (
          <CommissionConfigEditor config={commissionConfig} onUpdated={load} />
        )}

        {tab === "config" && (
          <AdminConfigEditor configs={data?.configs} onUpdated={load} />
        )}
      </div>
    </div>
  );
}