import React, { useEffect, useState } from "react";
import ReferralAttributionService from "@/services/referral/ReferralAttributionService";

const STORAGE_KEY = "borisend_referral_code";

/**
 * ReferralAttributionProcessor — Runs inside AppLayout (authenticated).
 * Checks localStorage for a captured referral code and processes the attribution
 * via the backend. Clears the stored code after processing.
 *
 * Renders nothing — this is a side-effect handler.
 */
export default function ReferralAttributionProcessor() {
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    const storedCode = localStorage.getItem(STORAGE_KEY);
    if (!storedCode || processed) return;

    ReferralAttributionService.processAttribution(storedCode)
      .then(() => {
        localStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => {
        // Clear even on error — don't retry indefinitely
        localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => {
        setProcessed(true);
      });
  }, [processed]);

  return null;
}