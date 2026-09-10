import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useTrialStatus() {
  const [trialStatus, setTrialStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("getTrialStatus", {});
      setTrialStatus(res.data);
      setLoading(false);
    } catch (e) {
      console.error("Failed to load trial status:", e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { trialStatus, loading, reload: load };
}