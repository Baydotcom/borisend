import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Home } from "lucide-react";

/**
 * AdminPageHeader — shared navigation for secondary Admin pages.
 * Provides:
 *   - Back (returns to previous page, like browser back)
 *   - Admin Home (explicitly routes to /admin dashboard)
 *
 * Mobile safe-area compatible via PageHeader's existing safe-area-top.
 */
export default function AdminPageHeader({ title, subtitle, rightAction }) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30 safe-area-top">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all -ml-2 touch-manipulation"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/admin")}
            aria-label="Admin dashboard"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all touch-manipulation"
          >
            <Home className="w-4 h-4" />
          </button>
          {rightAction && <div>{rightAction}</div>}
        </div>
      </div>
    </div>
  );
}