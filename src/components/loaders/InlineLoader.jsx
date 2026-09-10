import React from "react";
import BoriSendLogo from "@/components/BoriSendLogo";

/**
 * BoriSend compact inline / section loader.
 *
 * Use for a small content area, card, or list waiting for data — NOT for a
 * full page (use PageLoader) and NOT for application startup (use
 * StartupScreen). Small approved Magenta logo with a restrained rotation,
 * kept compact so it never dominates a section.
 *
 * Tiny action feedback (save / delete / checkout buttons) should keep its
 * own compact spinner — this component is for content/section loading.
 */
export default function InlineLoader({ label = "Loading" }) {
  return (
    <span
      className="inline-flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <BoriSendLogo variant="primary" className="borisend-logo-spin h-7 w-auto" decorative />
    </span>
  );
}