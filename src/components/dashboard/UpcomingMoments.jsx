import React from "react";
import { Link } from "react-router-dom";
import { Gift, CalendarClock } from "lucide-react";

/**
 * Coming Up — upcoming RelationshipMemory dates (PlanRecipient-scoped).
 * No invented occasions; annual recurrence assumed for important_date only.
 */
export default function UpcomingMoments({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="text-sm font-semibold text-foreground mb-3">Coming Up</h2>
      <div className="bg-card border border-border/60 rounded-2xl divide-y divide-border/40">
        {items.map((m) => {
          const isMilestone = m.label?.toLowerCase().includes('anniversar') || false;
          const Icon = isMilestone ? CalendarClock : Gift;
          return (
            <Link
              key={m.id}
              to={m.campaignId ? `/campaigns/${m.campaignId}` : "/people"}
              className="flex items-center gap-3 p-3 first:rounded-t-2xl last:rounded-b-2xl active:bg-muted/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.label}</p>
                <p className="text-xs text-muted-foreground truncate">{m.contactName}</p>
              </div>
              {m.isTriggerActive && (
                <span className="text-[9px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                  Trigger
                </span>
              )}
              <span className="text-xs font-medium text-muted-foreground shrink-0">
                {formatRelative(m.daysUntil)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function formatRelative(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `${days} days`;
  if (days < 14) return "1 week";
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} weeks`;
  const months = Math.floor(days / 30);
  return months >= 1 ? `${months} month${months > 1 ? "s" : ""}` : `${days} days`;
}