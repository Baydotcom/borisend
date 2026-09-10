import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import PageHeader from "@/components/layout/PageHeader";
import InboxMessageRow from "@/components/inbox/InboxMessageRow";
import { Loader2, Inbox, Search, Check, Send, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/I18nContext";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/common/PullToRefreshIndicator";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { SMSService } from "@/services/mobile";

const TABS = [
  { key: "approved", labelKey: "inboxReadyToSend" },
  { key: "pending", labelKey: "inboxAwaitingApproval" },
  { key: "scheduled", labelKey: "inboxScheduled" },
  { key: "failed", labelKey: "inboxFailed" },
  { key: "sent_today", labelKey: "inboxSentToday" },
];

export default function SmartInbox() {
  const { t } = useI18n();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("approved");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);

  const load = useCallback(async () => {
    const items = await base44.entities.Message.list("-created_date", 100);
    setMessages(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Message.subscribe(() => load());
    return () => unsubscribe();
  }, [load]);

  useRefreshOnFocus(load);
  const { pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(load);

  const filtered = messages.filter(m => {
    if (tab === "sent_today") {
      if (m.status !== "sent" || !m.sent_at) return false;
      const sentDate = new Date(m.sent_at);
      const today = new Date();
      return sentDate.toDateString() === today.toDateString();
    }
    if (tab === "scheduled") {
      return m.status === "approved" && m.scheduled_for && new Date(m.scheduled_for) > new Date();
    }
    if (tab === "approved") {
      return m.status === "approved" && (!m.scheduled_for || new Date(m.scheduled_for) <= new Date());
    }
    return m.status === tab;
  }).filter(m => {
    if (!search) return true;
    return m.recipient_name?.toLowerCase().includes(search.toLowerCase()) ||
           m.content?.toLowerCase().includes(search.toLowerCase());
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(m => m.id)));
    }
  };

  const handleApprove = async (id) => {
    await base44.entities.Message.update(id, { status: "approved" });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "approved" } : m));
    toast({ title: "Message approved" });
  };

  // RC20 Part 16: Opening the SMS composer does NOT mean the message was sent.
  // handleSend opens the composer + records composer_opened_at, keeping the
  // message in its pending/approved (user-action-required) state. The user
  // must explicitly confirm via handleConfirmSent after pressing Send in their
  // Messages app. Only markMessageSent({status:'sent'}) advances to 'sent'.
  const handleSend = async (message) => {
    try {
      await SMSService.send(message.recipient_phone, message.content, { mode: "manual" });
      const nowIso = new Date().toISOString();
      await base44.entities.Message.update(message.id, { composer_opened_at: nowIso });
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, composer_opened_at: nowIso } : m));
      toast({ title: "Opened in Messages", description: "Press Send there, then tap 'Confirm Sent'." });
    } catch (e) {
      toast({ title: "Could not open composer", description: e.message, variant: "destructive" });
    }
  };

  const handleConfirmSent = async (message) => {
    try {
      await base44.functions.invoke("markMessageSent", { message_id: message.id, status: "sent" });
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: "sent", sent_at: new Date().toISOString() } : m));
      toast({ title: "Message sent" });
    } catch (e) {
      toast({ title: "Could not confirm", description: e.message, variant: "destructive" });
    }
  };

  const handleSkip = async (id) => {
    try {
      const res = await base44.functions.invoke("skipMessage", { message_id: id });
      if (res.data?.blocked) {
        toast({ title: "Message Passes used", description: "You've used your Message Passes for this period. Available again next period.", variant: "destructive" });
        return;
      }
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "skipped" } : m));
      const remaining = res.data?.passes_remaining;
      toast({ title: "Message skipped", description: remaining != null ? `${remaining} pass${remaining === 1 ? "" : "es"} remaining` : undefined });
    } catch (e) {
      toast({ title: "Could not skip", description: e.message, variant: "destructive" });
    }
  };

  // RC18 §13: Delete of pending/approved messages routes through skipMessage
  // (consumes a Message Pass) to prevent "free skip" via delete.
  const handleDelete = async (id) => {
    const msg = messages.find(m => m.id === id);
    if (msg && (msg.status === "pending" || msg.status === "approved")) {
      try {
        const res = await base44.functions.invoke("skipMessage", { message_id: id });
        if (res.data?.blocked) {
          toast({ title: "Cannot delete", description: "You've used your Message Passes for this period. Available again next period.", variant: "destructive" });
          return;
        }
        setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "skipped" } : m));
        toast({ title: "Message removed", description: "A Message Pass was used." });
      } catch (e) {
        toast({ title: "Could not delete", description: e.message, variant: "destructive" });
      }
    } else {
      await base44.entities.Message.delete(id);
      setMessages(prev => prev.filter(m => m.id !== id));
      toast({ title: "Message deleted" });
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selected);
    await base44.entities.Message.bulkUpdate(ids.map(id => ({ id, status: "approved" })));
    setMessages(prev => prev.map(m => selected.has(m.id) ? { ...m, status: "approved" } : m));
    setSelected(new Set());
    toast({ title: `${ids.length} messages approved` });
  };

  const handleBulkSend = async () => {
    // A device/browser can only present one SMS composer at a time. Process the
    // next selected message rather than pretending several composers opened.
    const next = filtered.find(m => selected.has(m.id) && !m.composer_opened_at) || filtered.find(m => selected.has(m.id));
    if (!next) return;
    try {
      await SMSService.send(next.recipient_phone, next.content, { mode: "manual" });
      const nowIso = new Date().toISOString();
      await base44.entities.Message.update(next.id, { composer_opened_at: nowIso });
      setMessages(prev => prev.map(m => m.id === next.id ? { ...m, composer_opened_at: nowIso } : m));
      setSelected(prev => { const n = new Set(prev); n.delete(next.id); return n; });
      toast({ title: "Opened next message", description: "Press Send in Messages, then confirm it in BoriSend. Continue with the remaining selected messages afterwards." });
    } catch (e) {
      toast({ title: "Could not open composer", description: e.message, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    const selectedMessages = messages.filter(m => selected.has(m.id));
    let resolved = 0;
    let blocked = 0;
    for (const msg of selectedMessages) {
      try {
        if (msg.status === "pending" || msg.status === "approved") {
          const res = await base44.functions.invoke("skipMessage", { message_id: msg.id });
          if (res.data?.blocked) { blocked++; continue; }
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: "skipped" } : m));
        } else {
          await base44.entities.Message.delete(msg.id);
          setMessages(prev => prev.filter(m => m.id !== msg.id));
        }
        resolved++;
      } catch { blocked++; }
    }
    setSelected(new Set());
    toast({
      title: `${resolved} message${resolved === 1 ? "" : "s"} resolved`,
      description: blocked ? `${blocked} could not be removed, usually because Message Passes are unavailable.` : undefined,
      variant: blocked && resolved === 0 ? "destructive" : "default",
    });
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="pb-4">
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />
      <PageHeader title={t("smartInbox")} onBack={false} />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-card border border-border/60 rounded-3xl p-4 shadow-sm">
          <p className="text-sm font-semibold">Messages waiting for you</p>
          <p className="text-xs text-muted-foreground mt-1">Review each message, make any changes you want, then open it in Messages when you are ready.</p>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("searchMessages")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
        </div>

        {/* Tabs - horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          {TABS.map(tabConfig => {
            const count = messages.filter(m => {
              if (tabConfig.key === "sent_today") {
                return m.status === "sent" && m.sent_at && new Date(m.sent_at).toDateString() === new Date().toDateString();
              }
              if (tabConfig.key === "scheduled") {
                return m.status === "approved" && m.scheduled_for && new Date(m.scheduled_for) > new Date();
              }
              if (tabConfig.key === "approved") {
                return m.status === "approved" && (!m.scheduled_for || new Date(m.scheduled_for) <= new Date());
              }
              return m.status === tabConfig.key;
            }).length;

            return (
              <button
                key={tabConfig.key}
                onClick={() => { setTab(tabConfig.key); setSelected(new Set()); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  tab === tabConfig.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {t(tabConfig.labelKey)} ({count})
              </button>
            );
          })}
        </div>

        {/* Select All */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                selected.size === filtered.length ? "bg-primary border-primary" : "border-border"
              }`}
            >
              {selected.size === filtered.length && <Check className="w-3 h-3 text-white" />}
            </button>
            <span className="text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} ${t("selected")}` : t("selectAll")}
            </span>
          </div>
        )}

        {/* Messages */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("noMessagesHere")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(msg => (
              <InboxMessageRow
                key={msg.id}
                message={msg}
                selected={selected.has(msg.id)}
                onSelect={toggleSelect}
                onApprove={handleApprove}
                onSend={handleSend}
                onConfirmSent={handleConfirmSent}
                onSkip={handleSkip}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4">
          <div className="max-w-lg mx-auto bg-primary text-primary-foreground rounded-2xl border border-primary p-3 flex items-center gap-2">
            <span className="text-xs font-semibold px-2">{selected.size} {t("selected")}</span>
            <div className="flex-1" />
            {tab === "pending" && (
              <button
                onClick={handleBulkApprove}
                className="px-3 py-1.5 rounded-lg border border-primary-foreground/30 text-xs font-semibold active:scale-95 transition-transform flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> {t("approve")}
              </button>
            )}
            {(tab === "approved" || tab === "pending") && (
              <button
                onClick={handleBulkSend}
                className="px-3 py-1.5 rounded-lg border border-primary-foreground/30 text-xs font-semibold active:scale-95 transition-transform flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" /> Open next
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-lg border border-primary-foreground/30 text-xs font-semibold active:scale-95 transition-transform flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-1.5 rounded-lg border border-primary-foreground/20 text-xs active:scale-95 transition-transform"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}