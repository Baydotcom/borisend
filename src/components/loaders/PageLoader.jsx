import React from "react";
import BoriSendLogo from "@/components/BoriSendLogo";

/**
 * BoriSend full-page in-app loader.
 *
 * Use ONLY for a genuine application page that cannot render meaningful
 * content until its own data loads AFTER startup (e.g. Plans, Plan Detail,
 * History, Message Detail, People detail, Subscription, admin pages).
 *
 * Do NOT use this for:
 *   - application startup / auth / profile resolution → use StartupScreen;
 *   - small cards / lists / buttons → use InlineLoader (or keep compact
 *     action spinners for save/delete/checkout).
 *
 * Visual: neutral application surface + the approved Magenta BoriSend logo
 * with a smooth, restrained rotation. Distinct from the solid-Magenta
 * startup screen so the two experiences are never confused.
 */
export default function PageLoader({ label = "Loading" }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background safe-area-top safe-area-bottom"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <BoriSendLogo variant="primary" className="borisend-logo-spin h-10 w-auto" decorative />
    </div>
  );
}