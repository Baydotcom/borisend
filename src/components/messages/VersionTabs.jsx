import React from "react";
import { Check } from "lucide-react";

export default function VersionTabs({ versions, activeVersionId, onSelectVersion }) {
  if (!versions || versions.length <= 1) return null;

  return (
    <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
      {versions.map((v, idx) => {
        const isActive = v.id === activeVersionId;
        const label = v.version_type === "original" ? "Version 1" : `Version ${v.version_number}`;
        return (
          <button
            key={v.id}
            onClick={() => onSelectVersion(v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
            {v.is_selected && <Check className="w-3 h-3" />}
          </button>
        );
      })}
    </div>
  );
}