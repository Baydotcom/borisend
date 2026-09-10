import React from "react";
import { CreditCard } from "lucide-react";

export default function BillingDescriptorNotice({ className = "" }) {
  return (
    <div className={`flex items-start gap-2 text-xs text-muted-foreground ${className}`}>
      <CreditCard className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
      <span>
        Charges for BoriSend may appear on your bank or card statement as{" "}
        <strong className="font-medium text-foreground">Macpeniel</strong> or{" "}
        <strong className="font-medium text-foreground">Macpeniel Limited</strong>.
      </span>
    </div>
  );
}