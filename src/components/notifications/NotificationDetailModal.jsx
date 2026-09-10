import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, ChevronRight, Clock } from "lucide-react";

const TYPE_LABELS = {
  message_ready: "Message Ready",
  awaiting_approval: "Approval Required",
  message_sent: "Message Sent",
  failed_send: "Send Failed",
  ai_generation_failed: "Generation Failed",
  campaign_paused: "Communication Plan Paused",
  campaign_resumed: "Communication Plan Resumed",
  campaign_completed: "Communication Plan Completed",
  quota_warning: "Quota Warning",
  subscription_expired: "Subscription Expired",
};

export default function NotificationDetailModal({ notification, onClose, onNavigate }) {
  if (!notification) return null;

  const typeLabel = TYPE_LABELS[notification.type] || "Notification";
  const createdDate = new Date(notification.created_date);

  return (
    <Dialog open={!!notification} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-heading">{notification.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{typeLabel}</span>
            <span>·</span>
            <Clock className="w-3 h-3" />
            <span>{createdDate.toLocaleString()}</span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{notification.body}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
            {notification.is_read ? (
              <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> <span>Read</span></>
            ) : (
              <><Bell className="w-3.5 h-3.5 text-primary" /> <span>Unread — now marked as read</span></>
            )}
          </div>
          {onNavigate && (
            <Button
              className="w-full h-10 rounded-xl"
              onClick={() => onNavigate(notification)}
            >
              {notification.action_label || "View"} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}