import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heart, ThumbsUp, RefreshCw, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const REASONS = [
  { value: "too_formal", label: "Too formal" },
  { value: "too_casual", label: "Too casual" },
  { value: "too_romantic", label: "Too romantic" },
  { value: "not_warm_enough", label: "Not warm enough" },
  { value: "too_long", label: "Too long" },
  { value: "too_short", label: "Too short" },
  { value: "did_not_sound_natural", label: "Doesn't sound natural" },
  { value: "did_not_sound_like_me", label: "Doesn't sound like me" },
  { value: "did_not_fit_occasion", label: "Doesn't fit the occasion" },
  { value: "wrong_humour_level", label: "Wrong humour level" },
  { value: "wrong_emoji_usage", label: "Wrong emoji usage" },
];

export default function FeedbackBar({ message, campaign, onFeedbackRecorded, onAlternativeCreated, disabled }) {
  const [showReasons, setShowReasons] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const handleQuickFeedback = async (rating) => {
    if (submitting || recorded) return;
    setSubmitting(true);
    try {
      await base44.functions.invoke("recordMessageFeedback", {
        message_id: message.id,
        rating,
        user_id: message.user_id,
      });
      setRecorded(true);
      toast({ title: rating === "love_it" ? "Great choice!" : "Thanks for the feedback" });
      if (onFeedbackRecorded) onFeedbackRecorded(rating);
    } catch (e) {
      toast({ title: "Could not save feedback", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReason = (value) => {
    setSelectedReasons((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  };

  const handlePrepareAnother = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const recentMessages = await base44.entities.Message.filter(
        { campaign_id: message.campaign_id, status: "sent" },
        "-created_date", 10
      ).then((msgs) => msgs.map((m) => m.content));

      const result = await base44.functions.invoke("generateMessage", {
        campaign,
        recipient: { name: message.recipient_name, phone: message.recipient_phone },
        plan_recipient_id: message.plan_recipient_id || undefined,
        occurrence: message.occurrence || message.scheduled_for || new Date().toISOString(),
        delivery_time_utc: message.occurrence || message.scheduled_for || new Date().toISOString(),
        user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        generation_type: "alternative",
        feedback: {
          rating: "prepare_another",
          reasons: selectedReasons,
          custom_reason: customReason,
        },
        recent_messages: recentMessages,
        user_id: message.user_id,
      });

      const data = result.data || result;

      if (data.blocked) {
        toast({
          title: "Version limit reached",
          description: data.reason || "You already have two prepared versions.",
          variant: "destructive",
        });
        setShowReasons(false);
        setSelectedReasons([]);
        setCustomReason("");
      } else if (data.message) {
        toast({ title: "Alternative version prepared" });
        if (onAlternativeCreated) onAlternativeCreated(data);
        setShowReasons(false);
        setSelectedReasons([]);
        setCustomReason("");
      }
    } catch (e) {
      toast({ title: "Could not prepare another version", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (recorded) {
    return (
      <div className="bg-success/10 border border-success/20 rounded-2xl p-4 text-center">
        <Heart className="w-6 h-6 text-success mx-auto mb-1" />
        <p className="text-sm font-medium text-success">Feedback recorded</p>
        <p className="text-xs text-muted-foreground mt-1">BoriSend will use this to improve future messages.</p>
      </div>
    );
  }

  if (showReasons) {
    return (
      <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">What could be better?</h3>
          <button
            onClick={() => { setShowReasons(false); setSelectedReasons([]); setCustomReason(""); }}
            className="p-1 rounded-lg hover:bg-muted"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => toggleReason(r.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedReasons.includes(r.value)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={customReason}
          onChange={(e) => setCustomReason(e.target.value)}
          placeholder="Other feedback (optional)"
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />

        <Button
          onClick={handlePrepareAnother}
          disabled={submitting || selectedReasons.length === 0}
          className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Prepare Alternative
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-center text-muted-foreground mb-1">How do you feel about this message?</p>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          onClick={() => handleQuickFeedback("love_it")}
          disabled={submitting || disabled}
          className="h-14 rounded-xl flex-col gap-1 hover:bg-success/10 hover:border-success/30"
        >
          <Heart className="w-5 h-5 text-success" />
          <span className="text-xs">Love it</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => handleQuickFeedback("its_okay")}
          disabled={submitting || disabled}
          className="h-14 rounded-xl flex-col gap-1 hover:bg-info/10 hover:border-info/30"
        >
          <ThumbsUp className="w-5 h-5 text-info" />
          <span className="text-xs">It's OK</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowReasons(true)}
          disabled={submitting || disabled}
          className="h-14 rounded-xl flex-col gap-1 hover:bg-primary/5 hover:border-primary/40 dark:hover:bg-primary/10"
        >
          <RefreshCw className="w-5 h-5 text-primary" />
          <span className="text-xs">Another</span>
        </Button>
      </div>
    </div>
  );
}