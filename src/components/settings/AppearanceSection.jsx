import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Type } from "lucide-react";
import { useI18n } from "@/lib/I18nContext";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const TEXT_SIZE_KEY = "borisend.text_size";

/**
 * AppearanceSection — centralised appearance management.
 * Supports Light, Dark, and Follow Device modes via next-themes.
 * Supports Text Size (Small / Standard / Large) via data-text-size attribute.
 *
 * Changes apply immediately and persist via localStorage (survives logout,
 * login, browser refresh, and mobile app restart).
 * Text size preference is user-scoped (browser localStorage) — no cross-user
 * leakage.
 */
export default function AppearanceSection() {
  const { t } = useI18n();
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [textSize, setTextSize] = useState("standard");

  // next-themes hydration: only show the real value after mount to avoid SSR mismatch
  useEffect(() => setMounted(true), []);

  // Load text size preference on mount
  useEffect(() => {
    const saved = localStorage.getItem(TEXT_SIZE_KEY);
    if (saved === "small" || saved === "standard" || saved === "large") {
      setTextSize(saved);
      document.documentElement.setAttribute("data-text-size", saved);
    } else {
      document.documentElement.setAttribute("data-text-size", "standard");
    }
  }, []);

  const currentTheme = mounted ? theme : "light";

  const handleTextSizeChange = (size) => {
    setTextSize(size);
    localStorage.setItem(TEXT_SIZE_KEY, size);
    document.documentElement.setAttribute("data-text-size", size);
    toast({ title: `Text size set to ${size === "small" ? "Small" : size === "large" ? "Large" : "Standard"}` });
  };

  const themeOptions = [
    { value: "light", label: t("themeLight"), desc: t("themeLightDesc"), icon: Sun },
    { value: "dark", label: t("themeDark"), desc: t("themeDarkDesc"), icon: Moon },
    { value: "system", label: t("themeSystem"), desc: t("themeSystemDesc"), icon: Monitor },
  ];

  const textSizeOptions = [
    { value: "small", label: "Small", desc: "Compact text" },
    { value: "standard", label: "Standard", desc: "Default size" },
    { value: "large", label: "Large", desc: "Easier reading" },
  ];

  return (
    <div className="space-y-6">
      {/* Theme selection */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t("appearance")}
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(({ value, label, desc, icon: Icon }) => {
            const isActive = currentTheme === value;
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all active:scale-95",
                  isActive
                    ? "border-primary bg-card"
                    : "border-border/50 bg-card hover:border-border"
                )}
                aria-pressed={isActive}
              >
                <ThemePreview mode={value} systemTheme={systemTheme} />
                <div className="flex items-center gap-1.5">
                  <Icon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-semibold", isActive ? "text-primary" : "text-foreground")}>
                    {label}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Text Size accessibility setting */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Type className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Text Size
          </h3>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {textSizeOptions.map(({ value, label, desc }) => {
            const isActive = textSize === value;
            return (
              <button
                key={value}
                onClick={() => handleTextSizeChange(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all active:scale-95",
                  isActive
                    ? "border-primary bg-card"
                    : "border-border/50 bg-card hover:border-border"
                )}
                aria-pressed={isActive}
              >
                <span
                  className={cn(
                    "font-heading font-bold leading-none",
                    value === "small" ? "text-sm" : value === "large" ? "text-xl" : "text-base",
                    isActive ? "text-primary" : "text-foreground"
                  )}
                >
                  A
                </span>
                <span className={cn("text-xs font-semibold", isActive ? "text-primary" : "text-foreground")}>
                  {label}
                </span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * ThemePreview — a tiny visual mockup showing how the app looks in each mode.
 */
function ThemePreview({ mode, systemTheme }) {
  const effectiveMode = mode === "system" ? (systemTheme || "light") : mode;
  const isDark = effectiveMode === "dark";

  const bg = isDark ? "#1a181a" : "#faf9fb";
  const surface = isDark ? "#272124" : "#ffffff";
  const bar = isDark ? "#3a363a" : "#e8e6ea";
  const accent = isDark ? "#ec4899" : "#d6197e";
  const text = isDark ? "#ece9f2" : "#2a1d2d";
  const subtext = isDark ? "#8a8298" : "#8a8a8a";

  return (
    <div className="w-full h-16 rounded-lg overflow-hidden border border-border/30" style={{ background: bg }}>
      <div className="flex flex-col h-full p-1.5 gap-1">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
          <div className="flex-1 h-1.5 rounded-full" style={{ background: bar }} />
        </div>
        <div className="flex-1 rounded p-1 flex flex-col gap-0.5" style={{ background: surface }}>
          <div className="h-1 w-3/4 rounded-full" style={{ background: text }} />
          <div className="h-1 w-1/2 rounded-full" style={{ background: subtext }} />
          <div className="flex-1 flex items-end">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
          </div>
        </div>
      </div>
    </div>
  );
}