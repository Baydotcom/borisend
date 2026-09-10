import { useState, useEffect, useRef, useCallback } from "react";

const PULL_THRESHOLD = 70;
const MAX_PULL = 100;
const RESISTANCE = 0.4;

/**
 * Mobile pull-to-refresh hook.
 * Attaches touch listeners to the window. Only activates when
 * the page is scrolled to the top and the user pulls downward.
 *
 * Performance: touch listeners are attached once (not re-created
 * on every pullDistance state change). A ref holds the current
 * pullDistance for the touchend handler.
 *
 * @param {Function} onRefresh - async refresh callback
 * @returns {{ pullDistance: number, refreshing: boolean }}
 */
export function usePullToRefresh(onRefresh) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Keep ref in sync with state for use in touchend handler
  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPullDistance(50);
    try {
      await onRefreshRef.current();
    } catch {
      // silent — the page's own error handling applies
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPullDistance(0);
    }
  }, []);

  useEffect(() => {
    const onTouchStart = (e) => {
      if (window.scrollY > 0 || refreshingRef.current) return;
      // Don't activate if the touch started inside an input/textarea/select
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e) => {
      if (!pullingRef.current || refreshingRef.current) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;
      // Only pull down, and only when at scroll top
      if (diff > 0 && window.scrollY <= 0) {
        const resisted = diff * RESISTANCE;
        setPullDistance(Math.min(resisted, MAX_PULL));
      } else if (diff <= 0) {
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        refresh();
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [refresh]); // Stable: refresh is wrapped in useCallback([])

  return { pullDistance, refreshing };
}