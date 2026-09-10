import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "borisend_referral_code";

/**
 * ReferralLinkCapture — Runs at Router level (outside ProtectedRoute).
 * Captures ?ref=CODE from the URL into localStorage before any auth redirect.
 * Does NOT process attribution — that happens in ReferralAttributionProcessor
 * after the user is authenticated.
 */
export default function ReferralLinkCapture() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem(STORAGE_KEY, ref);
    }
  }, [location.search]);

  return null;
}