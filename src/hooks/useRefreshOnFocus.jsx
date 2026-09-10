import { useEffect, useRef } from "react";

/**
 * Re-fetches data when the app becomes visible again.
 * Handles iOS Safari and Home Screen PWA focus/visibility events.
 */
export function useRefreshOnFocus(callback) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        savedCallback.current();
      }
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    window.addEventListener("pageshow", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
      window.removeEventListener("pageshow", handler);
    };
  }, []);
}