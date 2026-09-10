import React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * One-time RC8 theme migration.
 *
 * defaultTheme is "system" (Follow Device) so that EXISTING users who never
 * explicitly chose a theme keep the pre-RC8 behaviour BY DEFAULT — no
 * migration action is needed for them, and the default itself protects them
 * even if this migration ever fails to read the session token at load time.
 *
 * The migration only needs to opt NEW installations in to Light: on the first
 * post-RC8 load, if there is no prior-session token AND no stored theme, we
 * write "light". Existing users (token present) are left untouched so the
 * "system" default applies to them.
 *
 * Runs once per browser, before next-themes initialises:
 *   1. Explicit preference already stored ("theme" key) → keep it.
 *   2. New installation (no prior session token, no preference) → write "light".
 *   3. Existing user (token present, no preference) → leave unset;
 *      defaultTheme="system" keeps them on Follow Device.
 */
(function migrateThemePreference() {
  try {
    const MIGRATION_FLAG = "borisend.rc8.theme_migrated";
    if (localStorage.getItem(MIGRATION_FLAG)) return;

    // Explicit preference already stored — respect it.
    if (localStorage.getItem("theme") !== null) {
      localStorage.setItem(MIGRATION_FLAG, "1");
      return;
    }

    // New installation (no prior session token) → default to Light.
    const hasPriorSession =
      !!localStorage.getItem("base44_access_token") ||
      !!localStorage.getItem("token");
    if (!hasPriorSession) {
      localStorage.setItem("theme", "light");
    }
    // Existing user (token present) → leave unset; defaultTheme="system" applies.

    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // localStorage unavailable (private mode) — fall back to defaultTheme.
  }
})();

/**
 * ThemeProvider — system dark mode support.
 * Respects the device's system appearance (light/dark).
 * Uses class strategy to match tailwind.config.js darkMode: ["class"].
 *
 * defaultTheme is "system": existing users with no explicit preference stay on
 * Follow Device. New users are moved to Light by the one-time migration above.
 */
export default function ThemeProvider({ children }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}