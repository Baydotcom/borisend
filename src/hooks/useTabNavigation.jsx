import { useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Bottom-tab roots. Each tab "owns" a set of routes.
 * When the user navigates within a tab and then switches to
 * another tab, the last-visited path in the first tab is preserved.
 * Switching back restores that path instead of the tab root.
 */
const TAB_CONFIG = [
  { root: "/campaigns/new", test: (p) => p.startsWith("/campaigns/new") },
  { root: "/inbox", test: (p) => p.startsWith("/inbox") },
  { root: "/notifications", test: (p) => p.startsWith("/notifications") },
  { root: "/settings", test: (p) => p.startsWith("/settings") || p.startsWith("/notification-settings") },
  {
    root: "/",
    test: (p) =>
      p === "/" ||
      p.startsWith("/campaigns") ||
      p.startsWith("/messages") ||
      p.startsWith("/history") ||
      p.startsWith("/subscription") ||
      p.startsWith("/referrals"),
  },
];

function getTabForPath(pathname) {
  for (const tab of TAB_CONFIG) {
    if (tab.test(pathname)) return tab.root;
  }
  return "/";
}

export function useTabNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const tabPathsRef = useRef({});

  // Track the current path for the active tab
  useEffect(() => {
    const tab = getTabForPath(location.pathname);
    tabPathsRef.current[tab] = location.pathname;
  }, [location.pathname]);

  const navigateToTab = useCallback(
    (tabRoot) => {
      // Home tab always returns to the dashboard root, ignoring any
      // stored sub-path (e.g. /campaigns/:id) so tapping Home is never
      // a "back" gesture.
      if (tabRoot === "/") {
        if (location.pathname !== "/") {
          navigate("/");
        }
        return;
      }
      const storedPath = tabPathsRef.current[tabRoot];
      const targetPath = storedPath || tabRoot;
      // Only navigate if we're not already there
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [navigate, location.pathname]
  );

  return { navigateToTab };
}