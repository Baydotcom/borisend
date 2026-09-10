import React from "react";
import BoriSendLogo from "@/components/BoriSendLogo";

/**
 * BoriSend startup / loading screen.
 *
 * Solid BoriSend Magenta background + the approved White BoriSend logo centred
 * and rotating smoothly while genuine application startup occurs.
 *
 *   - Background: fixed BoriSend Magenta (design-system primary light value),
 *     identical in Light and Dark Mode so there is no Magenta shift on first paint.
 *   - Logo: the approved White logo (variant="startup"), centred, aspect preserved.
 *   - Rotation: 360deg linear, ~1.8s, CSS only (no animation library).
 *   - prefers-reduced-motion: logo stays static; background unchanged.
 *   - No artificial delay: visibility is controlled entirely by the parent
 *     loading state (auth / public-settings / profile resolution).
 */
export default function StartupScreen() {
  return (
    <div
      className="borisend-startup-bg fixed inset-0 z-[100] flex items-center justify-center safe-area-top safe-area-bottom"
      role="status"
      aria-live="polite"
      aria-label="BoriSend is loading"
    >
      <BoriSendLogo
        variant="startup"
        className="borisend-startup-logo w-24 h-auto sm:w-28 md:w-32"
        decorative
      />
    </div>
  );
}