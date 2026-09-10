import React from "react";
import { Loader2, ArrowDown } from "lucide-react";

/**
 * Fixed-position pull-to-refresh indicator.
 * Appears at the top of the viewport when the user pulls down.
 * Does not affect page layout.
 */
export default function PullToRefreshIndicator({ pullDistance, refreshing }) {
  if (pullDistance === 0 && !refreshing) return null;

  const height = refreshing ? 44 : pullDistance;
  const opacity = Math.min(pullDistance / 50, 1);
  const rotation = Math.min(pullDistance * 3, 180);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ height, opacity }}
    >
      {refreshing ? (
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      ) : (
        <ArrowDown
          className="w-5 h-5 text-primary transition-transform"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      )}
    </div>
  );
}