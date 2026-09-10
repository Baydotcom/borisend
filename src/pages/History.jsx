import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Loader2, CheckCircle, Clock, SkipForward, XCircle, Send, AlertCircle, MessageSquare, ChevronDown } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";

const statusConfig = {
  all: { label: "All", icon: MessageSquare },
  sent: { label: "Sent", icon: CheckCircle, color: "text-success" },
  pending: { label: "Pending", icon: Clock, color: "text-warning" },
  approved: { label: "Ready", icon: Send, color: "text-info" },
  skipped: { label: "Skipped", icon: SkipForward, color: "text-muted-foreground" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-destructive" },
};

const PAGE_SIZE = 20;

export default function History() {
  const [messages, setMessages] = useState([]);
  const [campaigns, setCampaigns] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTab] = useState("all");

  const load = useCallback(async () => {
    const [msgs, camps] = await Promise.all([
      base44.entities.Message.filter({}, "-created_date", PAGE_SIZE),
      base44.entities.Campaign.list("-created_date", 50),
    ]);
    const campMap = {};
    camps.forEach(c => { campMap[c.id] = c; });
    setMessages(msgs);
    setCampaigns(campMap);
    setHasMore(msgs.length === PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Message.subscribe(() => load());
    return () => unsubscribe();
  }, [load]);

  useRefreshOnFocus(load);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const lastDate = messages[messages.length - 1]?.created_date;
      let newMsgs;
      if (lastDate) {
        newMsgs = await base44.entities.Message.filter(
          { created_date: { $lt: lastDate } },
          "-created_date",
          PAGE_SIZE
        );
      } else {
        newMsgs = await base44.entities.Message.filter({}, "-created_date", PAGE_SIZE);
      }
      setMessages(prev => [...prev, ...newMsgs]);
      setHasMore(newMsgs.length === PAGE_SIZE);
    } catch (e) {
      console.error("Failed to load more:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  const filtered = tab === "all" ? messages : messages.filter(m => m.status === tab);

  return (
    <div>
      <PageHeader title="Message history" onBack={false} />

      <div className="px-4 pt-4">
        <div className="rounded-3xl bg-card/90 border border-border/60 p-4 mb-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Relationship moments</p>
          <p className="text-sm font-semibold mt-1">A record of the messages that keep your relationships moving.</p>
          <p className="text-xs text-muted-foreground mt-1">Review what is waiting, what was sent and what you chose to skip.</p>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full bg-muted/50 h-9 p-0.5 rounded-xl">
            {["all", "pending", "sent", "skipped"].map(t => (
              <TabsTrigger key={t} value={t} className="flex-1 text-xs rounded-lg capitalize data-[state=active]:bg-background data-[state=active]:shadow-sm">
                {statusConfig[t].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4 space-y-2 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm">No messages found</p>
            </div>
          ) : (
            filtered.map(msg => {
               const campaign = campaigns[msg.campaign_id];
               const StatusIcon = statusConfig[msg.status]?.icon || Clock;
               const statusColor = statusConfig[msg.status]?.color || "text-muted-foreground";
               return (
                 <div key={msg.id} className="bg-card/90 border border-border/60 rounded-2xl p-4 shadow-sm">
                   <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">{(msg.recipient_name || "?").charAt(0).toUpperCase()}</div>
                       <div>
                         <span className="text-xs font-semibold block">{msg.recipient_name}</span>
                         <span className={`text-[10px] capitalize ${statusColor}`}>{statusConfig[msg.status]?.label || msg.status}</span>
                       </div>
                     </div>
                     <span className="text-[10px] text-muted-foreground">
                       {msg.created_date ? new Date(msg.created_date).toLocaleDateString() : ""}
                     </span>
                   </div>
                   <p className="text-sm text-foreground/80 line-clamp-3 leading-relaxed">{msg.content}</p>
                   {campaign && (
                     <p className="text-[10px] text-muted-foreground mt-2">{campaign.name}</p>
                   )}
                 </div>
               );
             })
            )}
            {hasMore && (
             <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="w-full h-10 rounded-xl">
               {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
               Load more
             </Button>
            )}
            </div>
      </div>
    </div>
  );
}