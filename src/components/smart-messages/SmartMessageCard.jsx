import React from "react";
import { Link } from "react-router-dom";
import { Clock, Calendar, MapPin, Zap, Repeat, Users, Pause, Play } from "lucide-react";
import { formatTriggerDisplay } from "@/lib/smartMessageUtils";

/**
 * RC18.1 §11 — Smart Message list card.
 * Compact card for the Smart Messages management page.
 */
export default function SmartMessageCard({ sm, recipientCount, onToggle }) {
  const isActive = sm.status === "active";

  const triggerIcon = {
    time: Clock,
    date: Calendar,
    recurring_date: Repeat,
    manual_event: Zap,
    location_arrival: MapPin,
    location_departure: MapPin,
  };
  const Icon = triggerIcon[sm.trigger_type] || Zap;

  return (
    <Link
      to={`/smart-messages/${sm.id}`}
      className="block bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm active:scale-[0.99] transition-transform"
    >
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
          isActive ? "bg-primary" : "bg-muted"
        }`}>
          <Icon className={`w-5 h-5 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold truncate flex-1">{sm.name}</p>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
              isActive
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            }`}>
              {isActive ? "Active" : "Paused"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {recipientCount ?? 0}
            </span>
            <span className="truncate">{formatTriggerDisplay(sm.trigger_type, sm.trigger_config)}</span>
          </div>
          {sm.next_trigger_at && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Next: {new Date(sm.next_trigger_at).toLocaleString(undefined, {
                weekday: "short", day: "numeric", month: "short",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}