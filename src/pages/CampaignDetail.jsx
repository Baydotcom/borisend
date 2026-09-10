import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import {
  Play, Pause, Trash2, Copy, SkipForward, Loader2, Send, Clock, CheckCircle,
  XCircle, Users, Wand2, MoreVertical, AlertCircle, Pencil, PauseCircle
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/I18nContext";
import { SMSService } from "@/services/mobile";
import PlatformService from "@/services/mobile/PlatformService";
import { ChevronRight } from "lucide-react";

const statusStyles = {
  active: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  draft: "bg-muted text-muted-foreground",
  completed: "bg-info/15 text-info",
};

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const packagedMobile = PlatformService.isIOS() || PlatformService.isAndroid();
  const [campaign, setCampaign] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const load = useCallback(async () => {
    const [c, msgs] = await Promise.all([
      base44.entities.Campaign.get(id),
      base44.entities.Message.filter({ campaign_id: id }, "-created_date", 50),
    ]);
    setCampaign(c);
    setMessages(msgs);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Message.subscribe((event) => {
      if (event.data?.campaign_id === id) load();
    });
    return () => unsubscribe();
  }, [load, id]);

  useRefreshOnFocus(load);

  const toggleStatus = async () => {
    try {
      const res = await base44.functions.invoke("manageCampaign", { action: "toggleStatus", campaign_id: id });
      const newStatus = res.data?.status || (campaign.status === "active" ? "paused" : "active");
      setCampaign(c => ({ ...c, status: newStatus }));
      toast({ title: newStatus === "active" ? "Routine resumed" : "Routine paused" });
    } catch (e) {
      toast({ title: "Action blocked", description: e.response?.data?.error || e.message, variant: "destructive" });
    }
  };

  const duplicateCampaign = async () => {
    try {
      await base44.functions.invoke("manageCampaign", { action: "duplicate", campaign_id: id });
      toast({ title: "Routine duplicated" });
      navigate("/campaigns");
    } catch (e) {
      toast({ title: "Could not duplicate", description: e.response?.data?.error || e.message, variant: "destructive" });
    }
  };

  const deleteCampaign = async () => {
    try {
      await base44.functions.invoke("manageCampaign", { action: "delete", campaign_id: id });
      toast({ title: "Routine deleted" });
      navigate("/campaigns");
    } catch (e) {
      toast({ title: "Could not delete", description: e.message, variant: "destructive" });
    }
  };

  const generateMessage = async () => {
    setGenerating(true);
    try {
      const recentMessages = messages.filter(m => m.status === "sent").slice(0, 10).map(m => m.content);

      const result = await base44.functions.invoke("generateMessage", {
        campaign,
        recent_messages: recentMessages,
        delivery_time_utc: new Date().toISOString(),
        user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });

      const data = result?.data || result;

      // RC17 §6/§7: Deterministic result-state handling. The backend creates
      // the Message — the frontend must NOT create a duplicate. Each state
      // produces exactly one user-facing toast reflecting the final outcome.
      if (data?.preparing) {
        toast({ title: "Already preparing", description: data.reason || "BoriSend is preparing this message. Please wait a moment." });
      } else if (data?.blocked && data?.capacity_exhausted) {
        toast({ title: "Message limit reached", description: `You've used ${data.used} of ${data.effective} messages for this period.`, variant: "destructive" });
      } else if (data?.blocked) {
        toast({ title: "Cannot prepare", description: data.reason || "You already have prepared versions for this message.", variant: "default" });
      } else if (data?.message) {
        // Success (including reused and fallback-success). The backend created
        // the Message with proper generation_key and version metadata.
        const msgs = await base44.entities.Message.filter({ campaign_id: id }, "-created_date", 50);
        setMessages(msgs);
        if (data.reused) {
          toast({ title: "Message already prepared", description: "An existing message was found for this time." });
        } else if (data.used_fallback) {
          toast({ title: "Message prepared", description: "Review before sending." });
        } else {
          toast({ title: "Message prepared", description: campaign.approval_mode === "manual" ? "Review it before sending." : "Ready to send." });
        }
      } else if (data?.error) {
        toast({ title: "Could not prepare message", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Could not prepare message", description: "Unexpected response from BoriSend.", variant: "destructive" });
      }
    } catch (error) {
      const errMsg = error?.response?.data?.error || error.message || "Please try again.";
      toast({ title: "Could not prepare message", description: errMsg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!campaign) {
    return <div className="text-center pt-20 text-muted-foreground">Routine not found.</div>;
  }

  const msgCounts = {
    sent: messages.filter(m => m.status === "sent").length,
    pending: messages.filter(m => m.status === "pending").length,
    skipped: messages.filter(m => m.status === "skipped").length,
    failed: messages.filter(m => m.status === "failed").length,
  };

  return (
    <div>
      <PageHeader
        title={campaign.name}
        showHome
        rightAction={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted no-select" aria-label="Communication Plan options">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/campaigns/${id}/edit`)}>
                <Pencil className="w-4 h-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleStatus}>
                {campaign.status === "active" ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {campaign.status === "active" ? "Pause" : "Resume"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={duplicateCampaign}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="px-4 py-4 w-full max-w-3xl mx-auto">
        {/* Communication Plan summary */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-4 mb-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Communication Plan</p>
              <p className="text-sm font-semibold truncate">{campaign.name || "Communication Plan"}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">{campaign.tone} · {campaign.message_length}</p>
            </div>
            <Badge className={`${statusStyles[campaign.status]} text-xs capitalize`}>{campaign.status}</Badge>
          </div>
        </div>

        {/* Event trigger — manual events and web fallback for location-based routines */}
        {["manual_event", "location_arrival", "location_departure"].includes(campaign.trigger_type) && (
          <div className="bg-card border border-border/60 rounded-2xl p-4 mb-5">
            <div className="flex items-start gap-3 mb-3">
              <Wand2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {campaign.trigger_type === "manual_event"
                    ? (campaign.trigger_config?.manual_event_label || "Manual event")
                    : campaign.trigger_type === "location_arrival"
                      ? `Arrive at ${campaign.trigger_config?.location_place_name || "saved place"}`
                      : `Leave ${campaign.trigger_config?.location_place_name || "saved place"}`}
                </p>
                {campaign.trigger_config?.trigger_intent && (
                  <p className="text-xs text-muted-foreground mt-0.5">{campaign.trigger_config.trigger_intent}</p>
                )}
                {campaign.trigger_type !== "manual_event" && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {packagedMobile
                      ? "Automatic location detection is not enabled in this store build. Use the button below when the event happens."
                      : "Use the button below when the location event happens. Automatic native detection can be enabled in a future mobile build."}
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={generateMessage}
              disabled={generating || campaign.status !== "active"}
              className="w-full h-11 rounded-xl"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              {campaign.trigger_type === "manual_event" ? "Trigger now" : "Trigger manually"}
            </Button>
          </div>
        )}

        {/* RC15: Pending message banner */}
        {msgCounts.pending > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 mb-5">
            <div className="flex items-start gap-3">
              <PauseCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">
                  {msgCounts.pending} {msgCounts.pending === 1 ? "message" : "messages"} waiting for your review
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  New messages for this routine are paused until you review, edit, approve, skip or delete the current message.
                </p>
                {messages.filter(m => m.status === "pending").slice(0, 1).map(m => (
                  <a
                    key={m.id}
                    href={`/messages/${m.id}`}
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-2"
                  >
                    Review now <ChevronRight className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { icon: CheckCircle, count: msgCounts.sent, label: "Sent", color: "text-success" },
            { icon: Clock, count: msgCounts.pending, label: "Pending", color: "text-warning" },
            { icon: SkipForward, count: msgCounts.skipped, label: "Skipped", color: "text-muted-foreground" },
            { icon: XCircle, count: msgCounts.failed, label: "Failed", color: "text-destructive" },
          ].map(({ icon: Icon, count, label, color }) => (
            <div key={label} className="text-center p-3 rounded-2xl bg-card border border-border/50 shadow-sm">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
              <p className="text-lg font-bold">{count}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Recipients */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recipients</h3>
          <div className="flex flex-wrap gap-1.5">
            {(campaign.recipients || []).map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium">
                <Users className="w-3 h-3" /> {r.name}
              </span>
            ))}
          </div>
        </div>

        {/* Generate */}
        <Button
          onClick={generateMessage}
          disabled={generating}
          className="w-full h-12 rounded-xl mb-6"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
          Prepare message
        </Button>

        {/* Message History */}
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Messages</h3>
        {messages.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Wand2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            No messages yet. Prepare your first one above.
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {messages.map(msg => (
              <MessageItem key={msg.id} msg={msg} campaignId={id} onUpdate={(updatedMsg) => {
                setMessages(ms => ms.map(m => m.id === updatedMsg.id ? updatedMsg : m));
              }} />
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this routine?</AlertDialogTitle>
            <AlertDialogDescription>This removes the Communication Plan and stops future messages from it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCampaign} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MessageItem({ msg, onUpdate }) {
  const [sending, setSending] = useState(false);

  const statusIcon = {
    sent: <CheckCircle className="w-3.5 h-3.5 text-success" />,
    pending: <Clock className="w-3.5 h-3.5 text-warning" />,
    approved: <Send className="w-3.5 h-3.5 text-info" />,
    skipped: <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />,
    failed: <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
    draft: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  };

  const handleApprove = async () => {
    await base44.entities.Message.update(msg.id, { status: "approved" });
    onUpdate({ ...msg, status: "approved" });
    toast({ title: "Message approved" });
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await SMSService.send(msg.recipient_phone, msg.content, { mode: "manual" });
      const nowIso = new Date().toISOString();
      await base44.entities.Message.update(msg.id, { composer_opened_at: nowIso });
      onUpdate({ ...msg, composer_opened_at: nowIso });
      toast({ title: "Opened in Messages", description: "Press Send there, then return here and confirm it was sent." });
    } catch (e) {
      toast({ title: "Could not open composer", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleConfirmSent = async () => {
    setSending(true);
    try {
      await base44.functions.invoke("markMessageSent", { message_id: msg.id, status: "sent" });
      onUpdate({ ...msg, status: "sent", sent_at: new Date().toISOString() });
      toast({ title: "Message sent" });
    } catch (e) {
      toast({ title: "Could not confirm", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSkip = async () => {
    try {
      await base44.functions.invoke("skipMessage", { message_id: msg.id });
      onUpdate({ ...msg, status: "skipped" });
    } catch (e) {
      toast({ title: "Could not skip", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {statusIcon[msg.status]}
          <span className="text-xs font-medium capitalize">{msg.status}</span>
          <span className="text-xs text-muted-foreground">· to {msg.recipient_name}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {msg.created_date ? new Date(msg.created_date).toLocaleDateString() : ""}
        </span>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed mb-3">{msg.content}</p>

      {msg.status === "pending" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleApprove} className="flex-1 h-8 text-xs">
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={handleSkip} className="h-8 text-xs">
            Skip
          </Button>
        </div>
      )}
      {msg.status === "approved" && (
        <div className="space-y-2">
          <Button size="sm" onClick={handleSend} disabled={sending} className="w-full h-8 text-xs bg-success hover:bg-success/90 text-success-foreground">
            <Send className="w-3 h-3 mr-1" /> Open in Messages
          </Button>
          {msg.composer_opened_at && (
            <Button size="sm" variant="outline" onClick={handleConfirmSent} disabled={sending} className="w-full h-8 text-xs">
              <CheckCircle className="w-3 h-3 mr-1" /> Confirm Sent
            </Button>
          )}
        </div>
      )}
    </div>
  );
}