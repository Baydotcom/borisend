import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Clock, Send, CalendarClock, ArrowRight } from "lucide-react";

const KIND_ICON = {
  pending_review: Clock,
  scheduled_today: Send,
  plan_due_today: CalendarClock,
};

/**
 * Today's Connections — prioritised actionable list (top 3 by default).
 * Shows "View all [N]" when more items exist beyond the displayed 3.
 * RC16.2 §17/§19: default display limit 3, expand on demand.
 */
export default function TodaysConnections({ items, total }) {
  if (!items || items.length === 0) return null;
  const totalCount = total ?? items.length;
  const hasMore = totalCount > items.length;

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Today's Connections</h2>
        {totalCount > 0 && (
          <span className="text-[11px] font-medium text-muted-foreground">{totalCount} total</span>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind] || Clock;
          const toneClass =
            item.kind === "pending_review" ? "text-warning" :
            item.kind === "scheduled_today" ? "text-info" :
            "text-primary";
          return (
            <Link
              key={`${item.kind}_${item.id}`}
              to={item.url}
              className="flex items-center gap-3 bg-card border border-border/60 rounded-2xl p-3 active:scale-[0.99] transition-transform"
            >
              <div className={`w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 ${toneClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.relationshipLabel} · {item.detail}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-medium text-primary">{item.actionLabel}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
            </Link>
          );
        })}
      </div>
      {hasMore && (
        <Link
          to="/inbox"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary py-2.5 mt-1 active:opacity-70 transition-opacity"
        >
          View all {totalCount} <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </section>
  );
}