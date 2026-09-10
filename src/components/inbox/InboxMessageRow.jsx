import React from "react";
import { Send, Check, SkipForward, Trash2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STATUS_STYLES = {
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  sent: "bg-info/10 text-info border-info/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  skipped: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
};

export default function InboxMessageRow({
  message,
  selected,
  onSelect,
  onApprove,
  onSend,
  onConfirmSent,
  onSkip,
  onDelete,
}) {
  const navigate = useNavigate();

  return (
    <div
      className={`flex gap-2 p-3 rounded-xl border transition-colors ${
        selected ? "bg-card border-primary/50" : "bg-card border-border/40"
      }`}
    >
      <button
        onClick={() => onSelect(message.id)}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
          selected ? "bg-primary border-primary" : "border-border"
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </button>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => navigate(`/messages/${message.id}`)}
      >
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold truncate">{message.recipient_name}</p>
          {message.recipient_phone && (
            <span className="text-xs text-muted-foreground">{message.recipient_phone}</span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium uppercase ml-auto ${STATUS_STYLES[message.status] || STATUS_STYLES.draft}`}>
            {message.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{message.content}</p>

        <div className="flex items-center gap-2">
          {message.status === "pending" && (
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(message.id); }}
              className="text-xs font-semibold text-primary active:scale-95 transition-transform flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Approve
            </button>
          )}
          {(message.status === "approved" || message.status === "pending") && (
            <button
              onClick={(e) => { e.stopPropagation(); onSend(message); }}
              className="text-xs font-semibold text-success active:scale-95 transition-transform flex items-center gap-1"
            >
              <Send className="w-3 h-3" /> Send
            </button>
          )}
          {message.composer_opened_at && message.status !== "sent" && message.status !== "failed" && (
            <button
              onClick={(e) => { e.stopPropagation(); onConfirmSent(message); }}
              className="text-xs font-semibold text-info active:scale-95 transition-transform flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Confirm Sent
            </button>
          )}
          {message.status !== "sent" && message.status !== "failed" && (
            <button
              onClick={(e) => { e.stopPropagation(); onSkip(message.id); }}
              className="text-xs font-semibold text-muted-foreground active:scale-95 transition-transform flex items-center gap-1"
            >
              <SkipForward className="w-3 h-3" /> Skip
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(message.id); }}
            className="text-xs text-muted-foreground hover:text-destructive active:scale-95 transition-transform ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}