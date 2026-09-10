import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertTriangle } from "lucide-react";

/**
 * RC18: Commerce capacity card — shows all 5 capacity types.
 */
export default function CapacityCard() {
  const [cap, setCap] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("getCapacityStatus", {});
      setCap(res.data);
    } catch (e) { /* ignore — card is non-blocking */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!cap) return null;

  const Bar = ({ used, effective, over }) => {
    const pct = effective <= 0 ? 100 : Math.min(100, Math.round((used / effective) * 100));
    const color = over || pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";
    return (
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  const Row = ({ title, c }) => {
    const extra = [];
    if (c.breakdown?.addons > 0) extra.push(`Add-ons +${c.breakdown.addons}`);
    if (c.breakdown?.adjustments > 0) extra.push(`Adjustments +${c.breakdown.adjustments}`);
    if (c.breakdown?.promotions > 0) extra.push(`Promo +${c.breakdown.promotions}`);
    const unlimited = c.effective >= 999999;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{title}</span>
          <span className="font-semibold">{unlimited ? `${c.used} · Unlimited` : `${c.used} of ${c.effective}`}</span>
        </div>
        {!unlimited && <Bar used={c.used} effective={c.effective} over={c.isOverCapacity} />}
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Included {c.breakdown?.base ?? 0}{extra.length ? ` · ${extra.join(" · ")}` : ""}</span>
          {c.isOverCapacity && <span className="text-destructive font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Over by {c.overCapacity}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-card/90 border border-border/60 rounded-3xl p-4 space-y-4 shadow-sm">
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Your BoriSend capacity</p>
        <p className="text-xs text-muted-foreground mt-1">A simple view of what is available on your account.</p>
      </div>
      <Row title="Communication Plans" c={cap.plan} />
      <Row title="Recipients" c={cap.recipient} />
      {cap.message && <Row title="Generated Messages" c={cap.message} />}
      {cap.message_pass && <Row title="Message Passes" c={cap.message_pass} />}
      {cap.smart_message && <Row title="Smart Messages" c={cap.smart_message} />}
    </div>
  );
}