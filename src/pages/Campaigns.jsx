import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Loader2, Plus, Search, ChevronDown, Zap } from "lucide-react";
import BoriSendLogo from "@/components/BoriSendLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/layout/PageHeader";
import CommunicationPlanCard from "@/components/dashboard/CommunicationPlanCard";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/common/PullToRefreshIndicator";
import { useI18n } from "@/lib/I18nContext";

const TABS = ["all", "active", "paused", "completed", "draft"];

export default function Campaigns() {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  const load = useCallback(async () => {
    const c = await base44.entities.Campaign.list("-created_date", 100);
    setCampaigns(c.filter(camp => camp.status !== "archived"));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Campaign.subscribe(() => load());
    return () => unsubscribe();
  }, [load]);

  useRefreshOnFocus(load);
  const { pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(load);

  if (loading) {
    return <PageLoader />;
  }

  const filtered = (tab === "all" ? campaigns : campaigns.filter(c => c.status === tab))
    .filter(c => {
      if (!search) return true;
      return c.name?.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.created_date) - new Date(a.created_date);
      return new Date(a.created_date) - new Date(b.created_date);
    });

  return (
    <div>
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />
      <PageHeader
        title="Relationship Routines"
        onBack={false}
        rightAction={
          <Link to="/campaigns/new">
            <Button size="sm" className="h-8 rounded-lg text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> New
            </Button>
          </Link>
        }
      />

      <div className="px-4 pt-4">
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide mb-3">
          {TABS.map(tabKey => {
            const count = tabKey === "all" ? campaigns.length : campaigns.filter(c => c.status === tabKey).length;
            const label = tabKey === "all" ? t("all") : t(`status${tabKey.charAt(0).toUpperCase()}${tabKey.slice(1)}`);
            return (
              <button
                key={tabKey}
                onClick={() => setTab(tabKey)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  tab === tabKey ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
            className="text-xs text-muted-foreground font-medium flex items-center gap-1 active:scale-95 transition-transform"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${sortOrder === "oldest" ? "rotate-180" : ""}`} />
            {sortOrder === "newest" ? t("newestFirst") : t("oldestFirst")}
          </button>
        </div>

        {/* Relationship routines list */}
        <div className="space-y-2 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BoriSendLogo variant="primary" className="h-8 w-auto mx-auto mb-2" decorative />
              <p className="text-sm mb-1">No relationship routines found.</p>
              <Link to="/campaigns/new">
                <Button size="sm" className="mt-2">
                  <Plus className="w-4 h-4 mr-1" /> Create one
                </Button>
              </Link>
            </div>
          ) : (
            filtered.map(c => (
              <CommunicationPlanCard key={c.id} campaign={c} onUpdate={load} />
            ))
          )}
        </div>

        {/* Smart Messages entry point */}
        <Link
          to="/smart-messages"
          className="mt-4 flex items-center gap-3 bg-card border border-border/60 rounded-2xl p-4 active:scale-[0.99] transition-transform"
        >
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Smart Messages</p>
            <p className="text-xs text-muted-foreground">Fixed, event-triggered messages for routine communication</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground/50 -rotate-90" />
        </Link>
      </div>
    </div>
  );
}