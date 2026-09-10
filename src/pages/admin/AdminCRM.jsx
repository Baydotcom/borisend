import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Inbox, Search, Send, Users, Clock, MessageSquare, RefreshCw, StickyNote, CalendarDays } from "lucide-react";

const STATUS_LABELS = {
  open: "Open",
  waiting_on_team: "Waiting on team",
  waiting_on_user: "Waiting on user",
  resolved: "Resolved",
};

export default function AdminCRM() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({ conversations: [], users: [], profiles: [], campaigns: [] });
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [crmProfile, setCrmProfile] = useState(null);
  const [crmNotes, setCrmNotes] = useState([]);
  const [lifecycleStage, setLifecycleStage] = useState("new");
  const [tagsDraft, setTagsDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const loadDashboard = async () => {
    try {
      const res = await base44.functions.invoke("adminCrm", { action: "dashboard" });
      setData(res.data || { conversations: [], users: [], profiles: [], campaigns: [] });
    } catch (e) {
      toast({ title: "Could not load CRM", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.conversations || []).filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.subject, c.user_name, c.user_email, c.last_message_preview]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [data.conversations, search, statusFilter]);

  const loadCustomerContext = async (conversation) => {
    const userId = conversation?.owner_user_id;
    if (!userId || String(userId).startsWith("public:") || String(userId).startsWith("guest:")) {
      setCrmProfile(null);
      setCrmNotes([]);
      setLifecycleStage("new");
      setTagsDraft("");
      setFollowUpDraft("");
      return;
    }

    const profile = (data.profiles || []).find(p => p.user_id === userId) || null;
    setCrmProfile(profile);
    setLifecycleStage(profile?.lifecycle_stage || "new");
    setTagsDraft((profile?.tags || []).join(", "));
    setFollowUpDraft(profile?.next_follow_up_at ? new Date(profile.next_follow_up_at).toISOString().slice(0, 16) : "");

    try {
      const notesRes = await base44.functions.invoke("adminCrm", { action: "notes", user_id: userId });
      setCrmNotes(notesRes.data?.notes || []);
    } catch {
      setCrmNotes([]);
    }
  };

  const openConversation = async (conversation) => {
    setSelected(conversation);
    setMessages([]);
    setNoteDraft("");
    try {
      const res = await base44.functions.invoke("adminCrm", { action: "messages", conversation_id: conversation.id });
      const resolvedConversation = res.data?.conversation || conversation;
      setSelected(resolvedConversation);
      setMessages(res.data?.messages || []);
      await loadCustomerContext(resolvedConversation);
      await loadDashboard();
    } catch (e) {
      toast({ title: "Could not open conversation", description: e.response?.data?.error || e.message, variant: "destructive" });
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await base44.functions.invoke("adminCrm", { action: "reply", conversation_id: selected.id, body: reply.trim() });
      setReply("");
      await openConversation(selected);
      toast({ title: "Reply sent" });
    } catch (e) {
      toast({ title: "Could not send reply", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status) => {
    if (!selected) return;
    setBusy(true);
    try {
      await base44.functions.invoke("adminCrm", { action: "status", conversation_id: selected.id, status });
      const updated = { ...selected, status };
      setSelected(updated);
      await loadDashboard();
    } catch (e) {
      toast({ title: "Could not update status", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveCustomerProfile = async () => {
    const userId = selected?.owner_user_id;
    if (!userId || String(userId).startsWith("public:") || String(userId).startsWith("guest:")) return;
    setBusy(true);
    try {
      const tags = tagsDraft.split(",").map(t => t.trim()).filter(Boolean);
      const payload = {
        action: "save_profile",
        user_id: userId,
        tags,
        lifecycle_stage: lifecycleStage,
        next_follow_up_at: followUpDraft ? new Date(followUpDraft).toISOString() : null,
        last_contacted_at: crmProfile?.last_contacted_at || null,
      };
      const res = await base44.functions.invoke("adminCrm", payload);
      setCrmProfile(res.data?.profile || crmProfile);
      await loadDashboard();
      toast({ title: "Customer profile saved" });
    } catch (e) {
      toast({ title: "Could not save customer profile", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const addCustomerNote = async () => {
    const userId = selected?.owner_user_id;
    if (!userId || !noteDraft.trim()) return;
    setBusy(true);
    try {
      await base44.functions.invoke("adminCrm", { action: "add_note", user_id: userId, note: noteDraft.trim() });
      setNoteDraft("");
      const notesRes = await base44.functions.invoke("adminCrm", { action: "notes", user_id: userId });
      setCrmNotes(notesRes.data?.notes || []);
      toast({ title: "Internal note added" });
    } catch (e) {
      toast({ title: "Could not add note", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader />;

  const unread = (data.conversations || []).reduce((sum, c) => sum + (c.unread_by_admin || 0), 0);
  const waiting = (data.conversations || []).filter(c => c.status === "waiting_on_team" || c.status === "open").length;
  const selectedIsRegistered = Boolean(selected?.owner_user_id) && !String(selected.owner_user_id).startsWith("public:") && !String(selected.owner_user_id).startsWith("guest:");

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader title="CRM & Support" subtitle="Manage conversations and customer follow-up" />

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Inbox} label="Conversations" value={(data.conversations || []).length} />
          <StatCard icon={MessageSquare} label="Unread" value={unread} />
          <StatCard icon={Clock} label="Needs reply" value={waiting} />
          <StatCard icon={Users} label="Users" value={(data.users || []).length} />
        </div>

        <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
          <section className="bg-card border border-border/50 rounded-2xl overflow-hidden lg:sticky lg:top-24">
            <div className="p-3 border-b border-border/50 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations" className="pl-9" />
                </div>
                <Button variant="outline" size="icon" onClick={loadDashboard} aria-label="Refresh CRM">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-[66vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No conversations found.</div>
              ) : filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`w-full text-left p-4 border-b border-border/40 transition-colors ${selected?.id === c.id ? "bg-primary/5" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{c.subject}</p>
                        {(c.unread_by_admin || 0) > 0 && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">{c.user_name || c.user_email || "Unknown user"}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-2">{c.last_message_preview}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] whitespace-nowrap">{STATUS_LABELS[c.status] || c.status}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-card border border-border/50 rounded-2xl min-h-[520px]">
            {!selected ? (
              <div className="min-h-[520px] flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium text-foreground">Select a conversation</p>
                <p className="text-xs mt-1">Open a support thread to review the history and reply.</p>
              </div>
            ) : (
              <div className="flex flex-col min-h-[520px]">
                <div className="p-4 border-b border-border/50 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{selected.subject}</h2>
                    <p className="text-xs text-muted-foreground truncate">{selected.user_name || "Unknown user"} · {selected.user_email || "No email"}</p>
                  </div>
                  <Select value={selected.status || "open"} onValueChange={changeStatus} disabled={busy}>
                    <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {selectedIsRegistered && (
                  <div className="p-4 border-b border-border/50 bg-muted/20 space-y-4">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">Customer follow-up</p>
                        <p className="text-xs text-muted-foreground">Internal CRM profile for this registered BoriSend user.</p>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs font-medium mb-1.5">Lifecycle stage</p>
                        <Select value={lifecycleStage} onValueChange={setLifecycleStage} disabled={busy}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="at_risk">At risk</SelectItem>
                            <SelectItem value="churned">Churned</SelectItem>
                            <SelectItem value="vip">VIP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-1.5">Tags</p>
                        <Input value={tagsDraft} onChange={e => setTagsDraft(e.target.value)} placeholder="e.g. onboarding, premium" disabled={busy} />
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-1.5">Next follow-up</p>
                        <Input type="datetime-local" value={followUpDraft} onChange={e => setFollowUpDraft(e.target.value)} disabled={busy} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" onClick={saveCustomerProfile} disabled={busy}>Save customer profile</Button>
                    </div>

                    <div className="pt-3 border-t border-border/50">
                      <div className="flex items-center gap-2 mb-2">
                        <StickyNote className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold">Internal notes</p>
                      </div>
                      {crmNotes.length > 0 && (
                        <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                          {crmNotes.slice(0, 5).map(note => (
                            <div key={note.id} className="rounded-xl border border-border/50 bg-card p-3">
                              <p className="text-xs whitespace-pre-wrap">{note.note}</p>
                              {note.created_date && <p className="text-[10px] text-muted-foreground mt-1.5">{new Date(note.created_date).toLocaleString()}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      <Textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add an internal note visible only to admins…" rows={2} disabled={busy} />
                      <div className="flex justify-end mt-2">
                        <Button variant="outline" onClick={addCustomerNote} disabled={busy || !noteDraft.trim()}>Add note</Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 p-4 space-y-3 max-h-[56vh] overflow-y-auto bg-muted/10">
                  {messages.map(m => (
                    <div key={m.id} className={`max-w-[86%] rounded-2xl p-3 text-sm ${m.sender_type === "admin" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-card border border-border/60"}`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      <p className="text-[10px] opacity-70 mt-2">{m.sender_type === "admin" ? (m.sender_name || "BoriSend Support") : (m.sender_name || selected.user_name || "User")}</p>
                    </div>
                  ))}
                  {messages.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">Loading conversation…</p>}
                </div>

                <div className="p-4 border-t border-border/50">
                  <Textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Write a reply…" rows={4} />
                  <div className="flex justify-end mt-3">
                    <Button onClick={sendReply} disabled={busy || !reply.trim()}>
                      <Send className="w-4 h-4 mr-2" /> Send reply
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4">
      <Icon className="w-4 h-4 text-primary mb-2" />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
