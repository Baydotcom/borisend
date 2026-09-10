import React from "react";
import { NavLink } from "react-router-dom";
import { Home, ClipboardList, Plus, Users, Inbox, MessageSquareText, History, Bell, Settings, LifeBuoy, Shield } from "lucide-react";
import BoriSendLogo from "@/components/BoriSendLogo";
import { useAuth } from "@/lib/AuthContext";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/campaigns", label: "Relationship routines", icon: ClipboardList },
  { to: "/campaigns/new", label: "Create routine", icon: Plus },
  { to: "/people", label: "People", icon: Users },
  { to: "/inbox", label: "Message inbox", icon: Inbox },
  { to: "/smart-messages", label: "Smart Messages", icon: MessageSquareText },
  { to: "/history", label: "History", icon: History },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/support", label: "Support", icon: LifeBuoy },
];

export default function DesktopSidebar() {
  const { user } = useAuth();
  const isAdmin = user && ["admin", "super_admin"].includes(user.role);
  const visibleItems = isAdmin ? [...items, { to: "/admin", label: "Admin console", icon: Shield }] : items;
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border/70 bg-background px-4 py-5">
      <div className="px-2 mb-7"><BoriSendLogo /></div>
      <nav className="space-y-1" aria-label="BoriSend navigation">
        {visibleItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}