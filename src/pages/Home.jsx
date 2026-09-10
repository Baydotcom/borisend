import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Users, AlertCircle, Send, Gauge, RefreshCw, Bell,
  ChevronRight, ArrowRight, UsersRound, CalendarClock
} from "lucide-react";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/common/PullToRefreshIndicator";
import { useI18n } from "@/lib/I18nContext";
import TrialStatusBanner from "@/components/trial/TrialStatusBanner";
import PausedModeBanner from "@/components/trial/PausedModeBanner";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import DashboardStat from "@/components/dashboard/DashboardStat";
import TodaysConnections from "@/components/dashboard/TodaysConnections";
import NeedsAttention from "@/components/dashboard/NeedsAttention";
import MonthlySummary from "@/components/dashboard/MonthlySummary";
import RelationshipStateOverview from "@/components/dashboard/RelationshipStateOverview";
import UpcomingMoments from "@/components/dashboard/UpcomingMoments";
import ZeroPlanDashboard from "@/components/dashboard/ZeroPlanDashboard";
import SmartMessageSection from "@/components/dashboard/SmartMessageSection";
import InlineLoader from "@/components/loaders/InlineLoader";
import BoriSendCarousel from "@/components/media/BoriSendCarousel";

export default function Home() {
  const { t } = useI18n();
  const [summary, setSummary] = useState(null);
  const [smartMessages, setSmartMessages] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { trialStatus } = useTrialStatus();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [res, notifs, sms] = await Promise.all([
        base44.functions.invoke("getRelationshipDashboardSummary", {}),
        base44.entities.Notification.filter({ is_read: false }, "-created_date", 1).catch(() => []),
        base44.entities.SmartMessage.filter({}, "-created_date", 10).catch(() => []),
      ]);
      setSummary(res?.data || res);
      setUnreadNotifs(notifs.length);
      setSmartMessages(sms || []);
    } catch (err) {
      console.error("[Home] dashboard load failed", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useRefreshOnFocus(load);
  const { pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(load);

  useEffect(() => {
    load();
    let debounceTimer = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => load(), 350);
    };
    const unsubNotifs = base44.entities.Notification.subscribe(debouncedLoad);
    const unsubMsgs = base44.entities.Message.subscribe(debouncedLoad);
    const unsubCampaigns = base44.entities.Campaign.subscribe(debouncedLoad);
    const unsubPRs = base44.entities.PlanRecipient.subscribe(debouncedLoad);
    const unsubSMs = base44.entities.SmartMessage.subscribe(debouncedLoad);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubNotifs();
      unsubMsgs();
      unsubCampaigns();
      unsubPRs();
      unsubSMs();
    };
  }, [load]);

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-center py-20">
          <InlineLoader />
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("goodMorning") : hour < 18 ? t("goodAfternoon") : t("goodEvening");
  const firstName = summary?.greeting?.firstName || "there";

  return (
    <div className="px-4 pt-6 pb-4 w-full max-w-5xl mx-auto">
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />
      <TrialStatusBanner trialStatus={trialStatus} />
      <PausedModeBanner trialStatus={trialStatus} />

      {/* Relationship-first header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold shadow-sm ring-4 ring-primary/10 shrink-0">
            {firstName?.charAt(0)?.toUpperCase() || "B"}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{greeting}</p>
            <h1 className="text-xl font-heading font-bold tracking-tight truncate">{firstName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Who would you like to stay close to today?</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            aria-label="Refresh dashboard"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all touch-manipulation"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            to="/notifications"
            aria-label={`Notifications${unreadNotifs > 0 ? `, ${unreadNotifs} unread` : ""}`}
            className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all touch-manipulation"
          >
            <Bell className="w-4 h-4 text-muted-foreground" />
            {unreadNotifs > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
          </Link>
        </div>
      </div>

      <BoriSendCarousel placement="dashboard" className="mb-6 shadow-sm" />

      {!summary || summary?.zeroPlanState ? (
        <ZeroPlanDashboard summary={summary} />
      ) : !summary?.hasActiveRelationships ? (
        <ZeroActiveRelationshipsState />
      ) : (
        <>
          <div className="bg-card/80 border border-border/60 rounded-3xl p-4 mb-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Your relationships</p>
                <p className="text-sm font-semibold mt-1">See who may need a message or a little attention today.</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <UsersRound className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Relationship summary */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <DashboardStat
              label="Relationships"
              value={summary?.summary?.relationships ?? 0}
              sublabel="Active"
              icon={Users}
              variant="magenta"
            />
            <DashboardStat
              label="Needs Attention"
              value={summary?.summary?.needsAttention ?? 0}
              sublabel={summary?.summary?.needsAttention > 0 ? "Action required" : "All clear"}
              icon={AlertCircle}
              tone={summary?.summary?.needsAttention > 0 ? "warning" : null}
              variant="neutral"
            />
            <DashboardStat
              label="Connections This Month"
              value={summary?.summary?.connectionsThisMonth ?? 0}
              sublabel="Messages completed"
              icon={Send}
              variant="neutral"
            />
            <DashboardStat
              label="Consistency"
              value={summary?.summary?.consistency === null ? "—" : `${summary?.summary?.consistency}%`}
              sublabel={summary?.summary?.consistency === null ? "No data yet" : "On track"}
              icon={Gauge}
              variant="magenta"
            />
          </div>

          {/* Continue where you left off */}
          {summary?.continueAction && (
            <Link
              to={summary.continueAction.url}
              className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3.5 mb-5 active:scale-[0.99] transition-transform"
            >
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <UsersRound className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{summary.continueAction.label}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-semibold text-primary">{summary.continueAction.actionLabel}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
            </Link>
          )}

          {/* Partial setup prompt */}
          {summary?.isPartiallySetup && (
            <div className="bg-card border border-warning/30 rounded-2xl p-4 mb-5">
              <p className="text-sm font-medium text-foreground mb-1">Finish setting up your relationships</p>
              <p className="text-xs text-muted-foreground mb-3">
                Add people to your Communication Plans so BoriSend can start helping you stay connected.
              </p>
              <Link
                to="/campaigns"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary active:opacity-70 transition-opacity"
              >
                Continue setup <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Next Scheduled Communication — from Campaign scheduling, not just Message rows */}
          {summary?.nextScheduled && (
            <div className="bg-card border border-border/60 rounded-2xl p-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground">Next Communication</p>
                  <p className="text-sm font-semibold truncate">{summary.nextScheduled.label}</p>
                  <p className="text-xs text-muted-foreground">{summary.nextScheduled.detail}</p>
                </div>
              </div>
            </div>
          )}

          <TodaysConnections items={summary?.todaysConnections} total={summary?.todaysConnectionsTotal} />
          <NeedsAttention items={summary?.needsAttentionItems} total={summary?.needsAttentionTotal} />
          <MonthlySummary monthly={summary?.monthly} />
          <RelationshipStateOverview states={summary?.relationshipStates} />
          <UpcomingMoments items={summary?.upcomingMoments} />
          <SmartMessageSection smartMessages={smartMessages} capacity={summary?.capacity} />
          {/* Secondary: view all plans */}
          <Link
            to="/campaigns"
            className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground py-3 active:opacity-70 transition-opacity"
          >
            View all Communication Plans <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </>
      )}
    </div>
  );
}

function ZeroActiveRelationshipsState() {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border/60 flex items-center justify-center mx-auto mb-6">
        <Users className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-heading font-semibold mb-2">Finish setting up your relationships</h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
        Add people to a Communication Plan so BoriSend can start helping you stay connected.
      </p>
      <Link to="/campaigns">
        <button className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform">
          <ArrowRight className="w-4 h-4" /> Continue setup
        </button>
      </Link>
    </div>
  );
}