import React from "react";
import { PauseCircle } from "lucide-react";

export default function PausedModeBanner({ trialStatus }) {
  if (!trialStatus || !trialStatus.is_paused) return null;

  return (
    <div className="block mb-4 bg-destructive/10 border border-destructive/20 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
          <PauseCircle className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-destructive">
            Your trial has ended
          </p>
          <p className="text-xs text-muted-foreground">
            Some features are paused
          </p>
        </div>
      </div>
    </div>
  );
}