import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const getHashId = (hash) => {
  const rawId = hash.slice(1);

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
};

/**
 * ScrollToTop + Scroll Restoration
 *
 * On PUSH/REPLACE navigation: scrolls to top (or hash target).
 * On POP navigation (back/forward): restores the previously saved scroll position.
 *
 * Scroll positions are tracked per-path in a ref map so that
 * returning to a previously visited screen restores its scroll.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const scrollPositions = useRef({});
  const prevPathRef = useRef(pathname);

  // Track scroll position continuously
  useEffect(() => {
    const handleScroll = () => {
      scrollPositions.current[prevPathRef.current] = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (navigationType === "POP") {
      // Restore scroll position for this path
      const saved = scrollPositions.current[pathname];
      if (saved !== undefined) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: saved, left: 0, behavior: "instant" });
        });
      }
    } else {
      // PUSH or REPLACE — scroll to top (or hash)
      if (hash) {
        const id = getHashId(hash);
        const timer = window.setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
        }, 50);
        prevPathRef.current = pathname;
        return () => window.clearTimeout(timer);
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }

    prevPathRef.current = pathname;
  }, [pathname, hash, navigationType]);

  return null;
}