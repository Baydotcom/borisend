import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import PageHeader from "@/components/layout/PageHeader";
import NotificationItem from "@/components/notifications/NotificationItem";
import NotificationDetailModal from "@/components/notifications/NotificationDetailModal";
import { useNavigate } from "react-router-dom";
import { Loader2, BellOff, CheckCheck, Search } from "lucide-react";
import { useI18n } from "@/lib/I18nContext";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/common/PullToRefreshIndicator";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

export default function NotificationCenter() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [detailNotification, setDetailNotification] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const items = await base44.entities.Notification.list("-created_date", 100);
    setNotifications(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Notification.subscribe(() => load());
    return () => unsubscribe();
  }, [load]);

  useRefreshOnFocus(load);
  const { pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(load);

  const handleMarkRead = (id) => {
    const snapshot = notifications;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    base44.entities.Notification.update(id, { is_read: true }).catch(() => {
      setNotifications(snapshot);
      toast({ title: "Could not mark as read", description: "Please try again.", variant: "destructive" });
    });
  };

  const handleMarkAllRead = () => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    const snapshot = notifications;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    base44.entities.Notification.bulkUpdate(unread.map(n => ({ id: n.id, is_read: true }))).catch(() => {
      setNotifications(snapshot);
      toast({ title: "Could not mark all as read", description: "Please try again.", variant: "destructive" });
    });
  };

  const handleDelete = (id) => {
    const snapshot = notifications;
    setNotifications(prev => prev.filter(n => n.id !== id));
    base44.entities.Notification.delete(id).catch(() => {
      setNotifications(snapshot);
      toast({ title: "Could not delete notification", description: "Please try again.", variant: "destructive" });
    });
  };

  const resolveNotificationDestination = async (notification) => {
    const { type, message_id, campaign_id } = notification;

    switch (type) {
      case 'message_ready':
      case 'awaiting_approval':
      case 'message_sent':
      case 'failed_send': {
        if (message_id) {
          try {
            await base44.entities.Message.get(message_id);
            return `/messages/${message_id}`;
          } catch (e) {
            // Message doesn't exist or doesn't belong to user (RLS blocks it)
            return type === 'message_sent' ? '/history' : '/inbox';
          }
        }
        return type === 'message_sent' ? '/history' : '/inbox';
      }
      case 'ai_generation_failed':
      case 'campaign_paused':
      case 'campaign_resumed':
      case 'campaign_completed': {
        if (campaign_id) {
          try {
            await base44.entities.Campaign.get(campaign_id);
            return `/campaigns/${campaign_id}`;
          } catch (e) {
            return '/campaigns';
          }
        }
        return '/campaigns';
      }
      case 'quota_warning':
      case 'subscription_expired':
        return '/settings';
      case 'support_reply':
        return '/support';
      default:
        return null;
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }
    const destination = await resolveNotificationDestination(notification);
    if (destination) {
      navigate(destination);
    } else {
      setDetailNotification(notification);
    }
  };

  const filtered = notifications.filter(n => {
    if (tab === "unread" && n.is_read) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.body.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = groupByDate(filtered);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div>
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />
      <PageHeader
        title={t("notificationCenter")}
        rightAction={
          unreadCount > 0 ? (
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-primary flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted active:scale-95 transition-all"
            >
              <CheckCheck className="w-3.5 h-3.5" /> {t("markAllRead")}
            </button>
          ) : null
        }
      />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-card border border-border/60 rounded-3xl p-4 shadow-sm">
          <p className="text-sm font-semibold">Your reminders</p>
          <p className="text-xs text-muted-foreground mt-1">Updates about messages, routines and anything that needs your attention.</p>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t("all")} ({notifications.length})
          </button>
          <button
            onClick={() => setTab("unread")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === "unread" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t("unread")} ({unreadCount})
          </button>
        </div>

        {/* Notifications grouped by date */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <BellOff className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("noNotifications")}</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.items.map(n => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClick={handleNotificationClick}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <NotificationDetailModal
        notification={detailNotification}
        onClose={() => setDetailNotification(null)}
        onNavigate={(n) => {
          setDetailNotification(null);
          if (n.action_url) navigate(n.action_url);
        }}
      />
    </div>
  );
}

function groupByDate(notifications) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = { today: [], yesterday: [], earlier: [] };

  for (const n of notifications) {
    const date = new Date(n.created_date);
    date.setHours(0, 0, 0, 0);

    if (date.getTime() === today.getTime()) {
      groups.today.push(n);
    } else if (date.getTime() === yesterday.getTime()) {
      groups.yesterday.push(n);
    } else {
      groups.earlier.push(n);
    }
  }

  const result = [];
  if (groups.today.length) result.push({ label: "Today", items: groups.today });
  if (groups.yesterday.length) result.push({ label: "Yesterday", items: groups.yesterday });
  if (groups.earlier.length) result.push({ label: "Earlier", items: groups.earlier });
  return result;
}