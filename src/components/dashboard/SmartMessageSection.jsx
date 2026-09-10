import React from "react";
import { Link } from "react-router-dom";
import { Zap, ChevronRight } from "lucide-react";

/**
 * RC18.1 §45/§46 — Compact Smart Messages section for the Dashboard.
 * Shows active count, usage, and next trigger. Compact for zero-state.
 */
export default function SmartMessageSection({ smartMessages, capacity }) {
  const activeCount = smartMessages?.filter(sm => sm.status === "active").length ?? 0;
  const totalCount = smartMessages?.length ?? 0;
  const used = capacity?.smart_message?.used ?? 0;
  const effective = capacity?.smart_message?.effective ?? 30;
  const nextSm = smartMessages
    ?.filter(sm => sm.status === "active" && sm.next_trigger_at)
    ?.sort((a, b) => new Date(a.next_trigger_at) - new Date(b.next_trigger_at))?.[0];

  return (
    <Link
      to="/smart-messages"
      className="block bg-card border border-border/60 rounded-2xl p-4 mb-5 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Smart Messages</p>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          </div>
          {totalCount === 0 ? (
            <p className="text-xs text-muted-foreground mt-0.5">Automate your routine messages</p>
          ) : (
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground">
                Active: {activeCount}
              </span>
              <span className="text-xs text-muted-foreground">
                Used: {used}/{effective}
              </span>
              {nextSm && (
                <span className="text-xs text-muted-foreground truncate">
                  Next: {nextSm.name}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}