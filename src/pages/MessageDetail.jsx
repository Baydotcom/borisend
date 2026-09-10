import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, Send, SkipForward, CheckCircle, Edit3, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import FeedbackBar from "@/components/messages/FeedbackBar";
import VersionTabs from "@/components/messages/VersionTabs";
import { SMSService } from "@/services/mobile";

export default function MessageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [sending, setSending] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    const load = async () => {
      const m = await base44.entities.Message.get(id);
      setMsg(m);
      setEditContent(m.content);
      if (m.campaign_id) {
        try {
          const c = await base44.entities.Campaign.get(m.campaign_id);
          setCampaign(c);
        } catch { /* ignore */ }
        if (m.generation_key) {
          try {
            const allVersions = await base44.entities.Message.filter({
              generation_key: m.generation_key,
            });
            setVersions(allVersions.filter(v => !v.expired_at));
          } catch { /* ignore */ }
        }
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleApprove = async () => {
    await base44.entities.Message.update(id, {
      status: "approved",
      content: msg.content,
    });
    setMsg(m => ({ ...m, status: "approved" }));
    toast({ title: "Message approved" });
  };

  const handleSaveAndUse = async () => {
    await base44.entities.Message.update(id, {
      status: "approved",
      content: editContent,
      edited_content: editContent,
    });
    setMsg(m => ({ ...m, status: "approved", content: editContent, edited_content: editContent }));
    setEditing(false);
    toast({ title: "Saved & ready to send" });
  };

  const handleCancelEdit = () => {
    setEditContent(msg.content);
    setEditing(false);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await SMSService.send(msg.recipient_phone, msg.content, { mode: "manual" });
      const nowIso = new Date().toISOString();
      await base44.entities.Message.update(id, { composer_opened_at: nowIso });
      setMsg(m => ({ ...m, composer_opened_at: nowIso }));
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
      await base44.functions.invoke("markMessageSent", { message_id: id, status: "sent" });
      setMsg(m => ({ ...m, status: "sent", sent_at: new Date().toISOString() }));
      toast({ title: "Message sent" });
    } catch (e) {
      toast({ title: "Could not confirm", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const res = await base44.functions.invoke("skipMessage", { message_id: id });
      if (res.data?.blocked) {
        toast({ title: "Message Passes used", description: "You've used your Message Passes for this period. Available again next period.", variant: "destructive" });
        return;
      }
      setMsg(m => ({ ...m, status: "skipped" }));
      const remaining = res.data?.passes_remaining;
      toast({ title: "Message skipped", description: remaining != null ? `${remaining} Message Pass${remaining === 1 ? "" : "es"} remaining.` : "The next scheduled message can now proceed." });
      navigate(-1);
    } catch (e) {
      toast({ title: "Could not skip", description: e.message, variant: "destructive" });
    } finally {
      setSkipping(false);
    }
  };

  // RC18 §13: Delete must not become a "free skip".
  // Deleting a pending/approved message achieves the same workflow outcome as
  // Skip (resolves the occurrence, allows the next to proceed). To prevent the
  // loophole, pending/approved deletes are routed through skipMessage (which
  // consumes a Message Pass). If passes are exhausted, the delete is blocked.
  // Sent/skipped/failed/cancelled messages can be deleted freely (content cleanup only).
  const handleDelete = async () => {
    try {
      if (msg.status === "pending" || msg.status === "approved") {
        const res = await base44.functions.invoke("skipMessage", { message_id: id });
        if (res.data?.blocked) {
          toast({ title: "Cannot delete", description: "You've used your Message Passes for this period. Deleting a pending message requires a Message Pass. Available again next period.", variant: "destructive" });
          return;
        }
        toast({ title: "Message removed", description: "A Message Pass was used to resolve this message." });
      } else {
        await base44.entities.Message.delete(id);
        toast({ title: "Message deleted" });
      }
      navigate(-1);
    } catch (e) {
      toast({ title: "Could not delete", description: e.message, variant: "destructive" });
    }
  };

  const handleSelectVersion = (v) => {
    setMsg(v);
    setEditContent(v.content);
  };

  const handleAlternativeCreated = (data) => {
    if (data.message) {
      const newVersions = data.versions || [...versions, data.message];
      setVersions(newVersions);
      setMsg(data.message);
      setEditContent(data.message.content);
    }
  };

  const handleFeedbackRecorded = (rating) => {
    if (rating === "love_it" && msg) {
      setMsg(m => ({ ...m, is_selected: true }));
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div>
      <PageHeader title={`Message to ${msg.recipient_name}`} showHome />

      <div className="px-4 py-4 w-full max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4 bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm">
          <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold ring-4 ring-primary/10">{(msg.recipient_name || "?").charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">A moment with</p>
            <p className="text-sm font-semibold truncate">{msg.recipient_name}</p>
            {campaign?.name && <p className="text-xs text-muted-foreground truncate">{campaign.name}</p>}
          </div>
          <span className="text-[10px] capitalize px-2.5 py-1 rounded-full bg-muted text-muted-foreground">{msg.status}</span>
        </div>
        <div className="bg-card/90 border border-border/60 rounded-3xl p-5 mb-5 shadow-sm">
          {editing ? (
            <Textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={6}
              className="text-sm leading-relaxed"
              autoFocus
            />
          ) : (
            <p className="text-sm leading-relaxed text-foreground/80">{msg.content}</p>
          )}
        </div>

        {msg.status === "pending" && (
          <div className="space-y-3">
            <VersionTabs
              versions={versions}
              activeVersionId={msg.id}
              onSelectVersion={handleSelectVersion}
            />

            {editing ? (
              <>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveAndUse}
                    className="flex-1 h-12 rounded-xl"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Save &amp; Use
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="h-12 rounded-xl"
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center px-2">
                  Saving makes this the message you've chosen. No new version is generated, and the next scheduled message can proceed.
                </p>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    onClick={handleApprove}
                    className="flex-1 h-12 rounded-xl"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditing(true)}
                    className="h-12 rounded-xl"
                    aria-label="Edit message"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                </div>
                <FeedbackBar
                  message={msg}
                  campaign={campaign}
                  onFeedbackRecorded={handleFeedbackRecorded}
                  onAlternativeCreated={handleAlternativeCreated}
                />
                <Button
                  variant="outline"
                  onClick={handleSkip}
                  disabled={skipping}
                  className="w-full h-11 rounded-xl"
                >
                  {skipping ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <SkipForward className="w-4 h-4 mr-2" />}
                  Skip this message
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowDelete(true)}
                  className="w-full h-11 rounded-xl text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </>
            )}
          </div>
        )}

        {msg.status === "approved" && (
          <div className="space-y-2">
            <Button
              onClick={handleSend}
              disabled={sending}
              className="w-full h-12 rounded-xl bg-success hover:bg-success/90 text-success-foreground"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Open in Messages
            </Button>
            {msg.composer_opened_at && (
              <>
                <p className="text-xs text-muted-foreground text-center">After pressing Send in your Messages app, confirm it here.</p>
                <Button onClick={handleConfirmSent} disabled={sending} variant="outline" className="w-full h-11 rounded-xl">
                  <CheckCircle className="w-4 h-4 mr-2" /> Confirm Sent
                </Button>
              </>
            )}
          </div>
        )}

        {msg.status === "sent" && (
          <div className="text-center py-4">
            <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
            <p className="text-sm font-medium text-success">Message sent</p>
            {msg.sent_at && <p className="text-xs text-muted-foreground mt-1">{new Date(msg.sent_at).toLocaleString()}</p>}
          </div>
        )}
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              {msg.status === "pending" || msg.status === "approved"
                ? "Removing this prepared message will use one Message Pass to resolve it, allowing the next scheduled message to proceed."
                : "This will permanently remove the message record."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}