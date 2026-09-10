import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Capacity — compact, secondary. Derived from the authoritative
 * EntitlementService (server-side). RC18: now shows 5 capacity rows.
 *
 *   Communication Plans
 *   Recipient Units
 *   Generated Messages
 *   Message Passes
 *   Smart Messages
 */
export default function CapacityPanel({ capacity }) {
  if (!capacity) return null;
  const { plan, recipient, message, message_pass, smart_message } = capacity;
  const planPct = plan.effective > 0 ? Math.min(100, (plan.used / plan.effective) * 100) : 0;
  const recipPct = recipient.effective > 0 ? Math.min(100, (recipient.used / recipient.effective) * 100) : 0;
  const msgPct = message && message.effective > 0 ? Math.min(100, (message.used / message.effective) * 100) : 0;
  const passPct = message_pass && message_pass.effective > 0 ? Math.min(100, (message_pass.used / message_pass.effective) * 100) : 0;
  const smartPct = smart_message && smart_message.effective > 0 ? Math.min(100, (smart_message.used / smart_message.effective) * 100) : 0;
  const approaching = planPct >= 80 || recipPct >= 80 || msgPct >= 80 || passPct >= 80 || smartPct >= 80;
  const over = plan.isOverCapacity || recipient.isOverCapacity || (message && message.isOverCapacity) || (message_pass && message_pass.isOverCapacity) || (smart_message && smart_message.isOverCapacity);

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Your Capacity</h2>
        {over && (
          <span className="text-[11px] font-medium text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Over capacity
          </span>
        )}
      </div>
      <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-4">
        <CapacityRow
          label="Communication Plans"
          used={plan.used}
          effective={plan.effective}
          pct={planPct}
          over={plan.isOverCapacity}
          infinite={plan.effective >= 999999}
        />
        <div>
          <CapacityRow
            label="Recipient Units"
            used={recipient.used}
            effective={recipient.effective}
            pct={recipPct}
            over={recipient.isOverCapacity}
            infinite={recipient.effective >= 999999}
          />
          <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
            Each person in each active plan counts as one unit.
          </p>
        </div>
        {message && (
          <CapacityRow
            label="Generated Messages"
            used={message.used}
            effective={message.effective}
            pct={msgPct}
            over={message.isOverCapacity}
            infinite={message.effective >= 999999}
          />
        )}
        {message_pass && (
          <CapacityRow
            label="Message Passes"
            used={message_pass.used}
            effective={message_pass.effective}
            pct={passPct}
            over={message_pass.isOverCapacity}
            infinite={message_pass.effective >= 999999}
          />
        )}
        {smart_message && (
          <CapacityRow
            label="Smart Messages"
            used={smart_message.used}
            effective={smart_message.effective}
            pct={smartPct}
            over={smart_message.isOverCapacity}
            infinite={smart_message.effective >= 999999}
          />
        )}
      </div>
    </section>
  );
}

function CapacityRow({ label, used, effective, pct, over, infinite }) {
  const barColor = over ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-bold text-foreground">
          {infinite ? `${used} / ∞` : `${used} of ${effective}`}
        </span>
      </div>
      {!infinite && effective > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}