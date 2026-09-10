import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, AlertCircle, FileEdit, Layers, ArrowRight } from "lucide-react";

const TYPE_ICON = {
  pending_message: AlertCircle,
  setup_incomplete: FileEdit,
  over_capacity: Layers,
};

/**
 * Needs Your Attention — actionable items only (top 3 by default).
 * Shows "View all [N]" when more items exist beyond the displayed 3.
 * RC16.2 §17/§20: default display limit 3, expand on demand.
 * RC16.2 §21: deduped against Today's Connections (pending messages that
 * appear in Today's Connections are excluded here).
 */
export default function NeedsAttention({ items, total }) {
  if (!items || items.length === 0) return null;
  const totalCount = total ?? items.length;
  const hasMore = totalCount > items.length;

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Needs Your Attention</h2>
        <span className="text-[11px] font-medium text-muted-foreground">{totalCount} item{totalCount > 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = TYPE_ICON[item.type] || AlertCircle;
          const toneClass =
            item.type === "over_capacity" ? "text-destructive" :
            item.type === "setup_incomplete" ? "text-warning" :
            "text-warning";
          return (
            <Link
              key={item.id}
              to={item.url}
              className="flex items-start gap-3 bg-card border border-border/60 rounded-2xl p-3 active:scale-[0.99] transition-transform"
            >
              <div className={`w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 ${toneClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{item.title}</p>
                {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
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