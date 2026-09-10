import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Zap, RefreshCw } from "lucide-react";
import PageLoader from "@/components/loaders/PageLoader";
import SmartMessageCard from "@/components/smart-messages/SmartMessageCard";
import PageHeader from "@/components/layout/PageHeader";

export default function SmartMessages() {
  const [smartMessages, setSmartMessages] = useState([]);
  const [recipientCounts, setRecipientCounts] = useState({});
  const [capacity, setCapacity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [sms, capRes] = await Promise.all([
        base44.entities.SmartMessage.filter({}, "-created_date", 200),
        base44.functions.invoke("getCapacityStatus", {}).catch(() => ({ data: {} })),
      ]);
      setSmartMessages(sms);
      setCapacity(capRes?.data || capRes);

      // Load recipient counts for each Smart Message
      const allRecipients = await base44.entities.SmartMessageRecipient.filter({});
      const counts = {};
      for (const r of allRecipients) {
        counts[r.smart_message_id] = (counts[r.smart_message_id] || 0) + 1;
      }
      setRecipientCounts(counts);
    } catch (err) {
      console.error("[SmartMessages] load failed", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = base44.entities.SmartMessage.subscribe(load);
    const unsubRecip = base44.entities.SmartMessageRecipient.subscribe(load);
    return () => { unsub(); unsubRecip(); };
  }, [load]);

  if (loading) return <PageLoader label="Smart Messages" />;

  const smartCap = capacity?.smart_message;
  const activeCount = smartMessages.filter(sm => sm.status === "active").length;

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        title="Smart Messages"
        subtitle={activeCount > 0 ? `${activeCount} active` : undefined}
        rightAction={
          <button
            onClick={load}
            aria-label="Refresh"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all touch-manipulation"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
          </button>
        }
      />

      <div className="px-4 pt-4">
        <div className="rounded-3xl bg-card/90 border border-border/60 p-4 mb-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Thoughtful routines</p>
          <p className="text-sm font-semibold mt-1">Messages you want to remember at the right moment.</p>
          <p className="text-xs text-muted-foreground mt-1">Your words stay fixed. BoriSend helps with the timing; you remain in control of sending.</p>
        </div>
        {/* Capacity summary */}
        {smartCap && (
          <div className="bg-card/90 border border-border/60 rounded-2xl p-4 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Smart Message Usage</p>
              <p className="text-sm font-semibold">
                {smartCap.used}/{smartCap.effective}
              </p>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  smartCap.isOverCapacity ? "bg-destructive" : smartCap.remaining <= 3 ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, (smartCap.used / smartCap.effective) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {smartCap.remaining} remaining this period
            </p>
          </div>
        )}

        {/* List */}
        {smartMessages.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border/60 flex items-center justify-center mx-auto mb-6">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-heading font-semibold mb-2">Remember the messages that matter</h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
              Write the exact words once and choose when you want BoriSend to prepare them for you.
            </p>
            <Link to="/smart-messages/new">
              <button className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform">
                <Plus className="w-4 h-4" /> Create Smart Message
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {smartMessages.map(sm => (
              <SmartMessageCard
                key={sm.id}
                sm={sm}
                recipientCount={recipientCounts[sm.id] ?? 0}
              />
            ))}
          </div>
        )}

        {smartMessages.length > 0 && (
          <Link
            to="/smart-messages/new"
            className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-primary/30 text-primary text-sm font-semibold active:scale-[0.99] transition-transform"
          >
            <Plus className="w-4 h-4" /> Create Smart Message
          </Link>
        )}
      </div>
    </div>
  );
}