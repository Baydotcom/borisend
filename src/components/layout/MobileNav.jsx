import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Home, Plus, ClipboardList, Users, Settings } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useI18n } from "@/lib/I18nContext";
import { useTabNavigation } from "@/hooks/useTabNavigation";

export default function MobileNav() {
  const location = useLocation();
  const { t } = useI18n();
  const { navigateToTab } = useTabNavigation();

  const navItems = [
    { path: "/", icon: Home, label: t("navHome") },
    { path: "/campaigns", icon: ClipboardList, label: "Routines" },
    { path: "/campaigns/new", icon: Plus, label: "Create", isCreate: true },
    { path: "/people", icon: Users, label: t("navPeople") },
    { path: "/settings", icon: Settings, label: t("navSettings") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/70 safe-area-bottom md:hidden">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map(({ path, icon: Icon, label, isCreate }) => {
          const isActive = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

          if (isCreate) {
            return (
              <button
                key={path}
                onClick={() => navigateToTab(path)}
                aria-label={label}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center border-4 border-background transition-transform active:scale-95">
                  <Icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-[10px] mt-1 font-medium text-primary">{label}</span>
              </button>
            );
          }

          return (
            <button
              key={path}
              onClick={() => navigateToTab(path)}
              aria-label={label}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] transition-colors relative ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className={`w-9 h-7 rounded-full flex items-center justify-center transition-colors ${isActive ? "bg-primary/10" : ""}`}><Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} /></div>
              <span className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}