import React from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import PlatformService from "@/services/mobile/PlatformService";
import { Shield, LayoutDashboard, MessageSquare, Users, Package, Megaphone, Gift, Clock, SlidersHorizontal, Settings, BrainCircuit, ArrowLeft, Images } from "lucide-react";

const items = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/crm", label: "CRM & support", icon: MessageSquare },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/commercial", label: "Commercial", icon: SlidersHorizontal },
  { to: "/admin/plans", label: "Legacy plans", icon: Package },
  { to: "/admin/referrals", label: "Referrals", icon: Gift },
  { to: "/admin/trial", label: "Trials", icon: Clock },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/intelligence", label: "Message intelligence", icon: BrainCircuit },
  { to: "/admin/media", label: "Dashboard & web media", icon: Images },
  { to: "/admin/settings", label: "App settings", icon: Settings },
];

export default function AdminLayout() {
  if (PlatformService.isNative()) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border/70 bg-background px-4 py-5">
        <div className="flex items-center gap-3 px-2 mb-7">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"><Shield className="w-4 h-4 text-primary-foreground" /></div>
          <div><p className="text-sm font-bold">BoriSend Admin</p><p className="text-[11px] text-muted-foreground">Operations console</p></div>
        </div>
        <nav className="space-y-1" aria-label="Admin navigation">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({isActive}) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Icon className="w-4 h-4" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink to="/" className="mt-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to app</NavLink>
      </aside>
      <main className="md:ml-64"><Outlet /></main>
    </div>
  );
}