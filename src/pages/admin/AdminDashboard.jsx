import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Loader2, Users, Crown, BarChart3, Package, Megaphone, Settings, ChevronRight, Send, Shield, TrendingUp, Gift, Clock, MessageSquare } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const overview = await base44.functions.invoke("adminDashboardOverview", {});
      const { users = [], campaigns = [], messages = [], subs = [], plans = [] } = overview?.data || overview || {};

      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toLocaleDateString("en", { weekday: "short" });
        const dayDate = d.toISOString().split("T")[0];
        const count = messages.filter(m => {
          const msgDate = m.sent_at ? m.sent_at.split("T")[0] : (m.created_date ? m.created_date.split("T")[0] : null);
          return msgDate === dayDate;
        }).length;
        last7Days.push({ day: dayStr, messages: count });
      }
      setChartData(last7Days);

      const categories = {};
      campaigns.forEach(c => {
        const cat = c.category || "custom";
        categories[cat] = (categories[cat] || 0) + 1;
      });

      setStats({
        totalUsers: users.length,
        totalCampaigns: campaigns.length,
        totalMessages: messages.length,
        activeSubscriptions: subs.filter(s => s.status === "active").length,
        activeTrials: subs.filter(s => s.trial_status === "active" || s.status === "trial").length,
        plans: plans.length,
        categoryBreakdown: categories,
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  const cards = [
    { label: "Total users", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { label: "Communication Plans", value: stats.totalCampaigns, icon: Send, color: "text-info" },
    { label: "Messages sent", value: stats.totalMessages, icon: BarChart3, color: "text-success" },
    { label: "Active subs", value: stats.activeSubscriptions, icon: Crown, color: "text-warning" },
    { label: "Active trials", value: stats.activeTrials, icon: Clock, color: "text-info" },
  ];

  const links = [
    { path: "/admin/crm", label: "CRM & support", desc: "Conversations, enquiries and customer follow-up", icon: MessageSquare },
    { path: "/admin/users", label: "Manage users", desc: "View and manage all users", icon: Users },
    { path: "/admin/plans", label: "Manage plans", desc: "Create and edit subscription plans", icon: Package },
    { path: "/admin/announcements", label: "Announcements", desc: "Create announcements for users", icon: Megaphone },
    { path: "/admin/referrals", label: "Manage referrals", desc: "View referrals, rewards, payouts", icon: Gift },
    { path: "/admin/trial", label: "Trial management", desc: "Configure trials, extend or revoke", icon: Clock },
    { path: "/admin/commercial", label: "Commercial", desc: "Membership, add-ons, capacity adjustments", icon: Package },
    { path: "/admin/settings", label: "App settings", desc: "Configure global app settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold">Admin dashboard</h1>
            <p className="text-xs text-muted-foreground">Manage BoriSend</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {cards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl bg-card border border-border/50 p-4">
              <Icon className={`w-5 h-5 mb-2 ${color}`} />
              <p className="text-2xl font-bold tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* 7-day message activity chart */}
        <div className="bg-card border border-border/50 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Messages — last 7 days</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(320 8% 45%)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(320 8% 45%)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(320 14% 90%)", fontSize: 12 }}
                cursor={{ fill: "hsl(320 14% 95%)" }}
              />
              <Bar dataKey="messages" fill="hsl(325 78% 48%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          {links.map(({ path, label, desc, icon: Icon }) => (
            <Link key={path} to={path} className="flex items-center gap-3 bg-card border border-border/50 rounded-xl p-4 hover:shadow-sm transition-all active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            </Link>
          ))}
        </div>

        <Link to="/" className="block text-center text-sm text-primary font-medium mt-6">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}