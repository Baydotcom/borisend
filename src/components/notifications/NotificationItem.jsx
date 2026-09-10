import React from "react";
import {
  CheckCircle2, AlertCircle, XCircle, Send, Pause, Play,
  CheckCheck, Crown, Bell, Trash2, ChevronRight, CalendarClock, RefreshCw
} from "lucide-react";
import { useI18n } from "@/lib/I18nContext";

const TYPE_CONFIG = {
  message_ready: { icon: Send, color: "text-success", bg: "bg-success/10" },
  awaiting_approval: { icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
  message_sent: { icon: CheckCircle2, color: "text-info", bg: "bg-info/10" },
  failed_send: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  ai_generation_failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
  campaign_paused: { icon: Pause, color: "text-warning", bg: "bg-warning/10" },
  campaign_resumed: { icon: Play, color: "text-success", bg: "bg-success/10" },
  campaign_completed: { icon: CheckCheck, color: "text-success", bg: "bg-success/10" },
  quota_warning: { icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
  subscription_expired: { icon: Crown, color: "text-destructive", bg: "bg-destructive/10" },
  addon_expiry_reminder: { icon: CalendarClock, color: "text-warning", bg: "bg-warning/10" },
  addon_renewed: { icon: RefreshCw, color: "text-success", bg: "bg-success/10" },
};

export default function NotificationItem({ notification, onDelete, onClick }) {
  const { t } = useI18n();
  const config = TYPE_CONFIG[notification.type] || { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" };
  const Icon = config.icon;
  const isUnread = !notification.is_read;

  return (
    <div
      onClick={() => onClick(notification)}
      className={`flex gap-3 p-3 rounded-xl border transition-all cursor-pointer hover:bg-muted/60 active:scale-[0.99] ${
        isUnread ? "bg-muted/50 border-border/60" : "bg-card border-border/40"
      }`}
    >
      <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {isUnread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
          <p className="text-sm font-semibold truncate flex-1">{notification.title}</p>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.body}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
        className="self-start mt-1 text-muted-foreground hover:text-destructive active:scale-95 transition-transform shrink-0"
        aria-label={t("delete") || "Delete notification"}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}