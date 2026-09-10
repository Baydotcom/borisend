import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import { Loader2, Clock, TrendingUp, Users, CheckCircle2, AlertCircle, CalendarClock, CreditCard, RotateCcw, Ban } from "lucide-react";

export default function TrialManagement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [extendUserId, setExtendUserId] = useState("");
  const [extendDays, setExtendDays] = useState(7);
  const [extendReason, setExtendReason] = useState("");
  const [revokeUserId, setRevokeUserId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);

  const load = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      if (me.role !== "admin" && me.role !== "super_admin") { navigate("/"); return; }

      const [configRes, statsRes, plansData] = await Promise.all([
        base44.functions.invoke("adminTrialAction", { action: "get_config" }),
        base44.functions.invoke("adminTrialAction", { action: "get_stats" }),
        base44.entities.SubscriptionPlan.list("sort_order", 50),
      ]);

      setConfig(configRes.data?.config);
      setStats(statsRes.data);
      setPlans(plansData);
      setLoading(false);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("adminTrialAction", {
        action: "update_config",
        config_updates: config,
      });
      toast({ title: "Trial configuration saved" });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async () => {
    if (!extendUserId) return;
    setActionLoading("extend");
    try {
      const res = await base44.functions.invoke("adminTrialAction", {
        action: "extend_trial",
        target_user_id: extendUserId,
        extension_days: extendDays,
        reason: extendReason,
      });
      if (res.data?.success) {
        toast({ title: "Trial extended", description: `New end: ${new Date(res.data.new_trial_ends_at).toLocaleString()}` });
        setExtendUserId("");
        setExtendReason("");
        load();
      } else {
        toast({ title: "Error", description: res.data?.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeUserId) return;
    if (!confirm("Revoke this user's trial? This will pause their account.")) return;
    setActionLoading("revoke");
    try {
      const res = await base44.functions.invoke("adminTrialAction", {
        action: "revoke_trial",
        target_user_id: revokeUserId,
        reason: revokeReason,
      });
      if (res.data?.success) {
        toast({ title: "Trial revoked" });
        setRevokeUserId("");
        setRevokeReason("");
        load();
      } else {
        toast({ title: "Error", description: res.data?.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewAudit = async (userId) => {
    setActionLoading("audit");
    try {
      const res = await base44.functions.invoke("adminTrialAction", {
        action: "get_audit_history",
        target_user_id: userId,
      });
      setAuditLogs(res.data?.logs || []);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  const statCards = [
    { label: "Active Trials", value: stats?.active_trials || 0, icon: Clock, color: "text-primary" },
    { label: "Ending Today", value: stats?.trials_ending_today || 0, icon: CalendarClock, color: "text-amber-600" },
    { label: "Payment Methods", value: stats?.payment_methods_added || 0, icon: CreditCard, color: "text-blue-600" },
    { label: "Conversions Scheduled", value: stats?.conversions_scheduled || 0, icon: TrendingUp, color: "text-indigo-600" },
    { label: "Converted", value: stats?.converted || 0, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Expired", value: stats?.expired || 0, icon: AlertCircle, color: "text-red-600" },
    { label: "Paused", value: stats?.paused || 0, icon: Ban, color: "text-orange-600" },
    { label: "Conversion Rate", value: `${stats?.conversion_rate || 0}%`, icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader title="Trial Management" subtitle="7-Day Starter Trial system" />

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((s, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Billing interval breakdown */}
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Billing Interval Selections</h3>
          <div className="flex gap-4">
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-primary">{stats?.monthly_selections || 0}</p>
              <p className="text-xs text-muted-foreground">Monthly</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-indigo-600">{stats?.yearly_selections || 0}</p>
              <p className="text-xs text-muted-foreground">Annual</p>
            </div>
          </div>
        </div>

        {/* Configuration */}
        {config && (
          <div className="bg-card border border-border/50 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold">Trial Configuration</h3>

            <div className="flex items-center justify-between">
              <Label>Trial Enabled</Label>
              <Switch
                checked={config.trial_enabled}
                onCheckedChange={(v) => setConfig({ ...config, trial_enabled: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>Trial Plan</Label>
              <Select
                value={config.trial_plan_id || ""}
                onValueChange={(v) => {
                  const plan = plans.find((p) => p.id === v);
                  setConfig({ ...config, trial_plan_id: v, trial_plan_name: plan?.name || "" });
                }}
              >
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.filter((p) => p.is_active && p.price > 0).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Trial Duration (days)</Label>
              <Input
                type="number"
                value={config.trial_duration_days || 7}
                onChange={(e) => setConfig({ ...config, trial_duration_days: parseInt(e.target.value) || 7 })}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Trial Offer Name</Label>
              <Input
                value={config.trial_offer_name || ""}
                onChange={(e) => setConfig({ ...config, trial_offer_name: e.target.value })}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Default Billing Interval</Label>
              <Select
                value={config.default_billing_interval || "monthly"}
                onValueChange={(v) => setConfig({ ...config, default_billing_interval: v })}
              >
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Auto-Conversion Enabled</Label>
              <Switch
                checked={config.auto_conversion_enabled}
                onCheckedChange={(v) => setConfig({ ...config, auto_conversion_enabled: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Payment Reminder Enabled</Label>
              <Switch
                checked={config.payment_reminder_enabled}
                onCheckedChange={(v) => setConfig({ ...config, payment_reminder_enabled: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>Reminder Timing (hours before end)</Label>
              <Input
                type="number"
                value={config.reminder_timing_hours || 24}
                onChange={(e) => setConfig({ ...config, reminder_timing_hours: parseInt(e.target.value) || 24 })}
                className="h-11"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>One Trial Per Email</Label>
              <Switch
                checked={config.one_trial_per_email}
                onCheckedChange={(v) => setConfig({ ...config, one_trial_per_email: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>One Trial Per Person</Label>
              <Switch
                checked={config.one_trial_per_person}
                onCheckedChange={(v) => setConfig({ ...config, one_trial_per_person: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Allow Admin Extension</Label>
              <Switch
                checked={config.allow_admin_extension}
                onCheckedChange={(v) => setConfig({ ...config, allow_admin_extension: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>Max Extension Days</Label>
              <Input
                type="number"
                value={config.max_extension_days || 7}
                onChange={(e) => setConfig({ ...config, max_extension_days: parseInt(e.target.value) || 7 })}
                className="h-11"
              />
            </div>

            <Button className="w-full h-11 bg-primary hover:bg-primary/90 rounded-xl" onClick={handleSaveConfig} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Configuration
            </Button>
          </div>
        )}

        {/* Active Trials List */}
        {stats?.trials && stats.trials.length > 0 && (
          <div className="bg-card border border-border/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Active Trials</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {stats.trials.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs border-b border-border/30 pb-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{t.user_id}</p>
                    <p className="text-muted-foreground">
                      Status: <span className="font-medium text-foreground">{t.trial_status}</span>
                      {t.trial_conversion_scheduled && " · ⚡ Scheduled"}
                    </p>
                    <p className="text-muted-foreground">
                      Ends: {t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleViewAudit(t.user_id)}
                      className="p-1.5 hover:bg-muted rounded-lg"
                      title="View audit history"
                    >
                      <Users className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setExtendUserId(t.user_id)}
                      className="p-1.5 hover:bg-muted rounded-lg"
                      title="Extend trial"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setRevokeUserId(t.user_id)}
                      className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive"
                      title="Revoke trial"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extend Trial */}
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Extend Trial</h3>
          <Input placeholder="User ID" value={extendUserId} onChange={(e) => setExtendUserId(e.target.value)} className="h-11" />
          <div className="flex gap-2">
            <Input type="number" placeholder="Days" value={extendDays} onChange={(e) => setExtendDays(parseInt(e.target.value) || 7)} className="h-11" />
          </div>
          <Input placeholder="Reason" value={extendReason} onChange={(e) => setExtendReason(e.target.value)} className="h-11" />
          <Button className="w-full h-10 rounded-xl" variant="outline" onClick={handleExtend} disabled={actionLoading === "extend"}>
            {actionLoading === "extend" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Extend Trial"}
          </Button>
        </div>

        {/* Revoke Trial */}
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-destructive">Revoke Trial</h3>
          <Input placeholder="User ID" value={revokeUserId} onChange={(e) => setRevokeUserId(e.target.value)} className="h-11" />
          <Input placeholder="Reason" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} className="h-11" />
          <Button className="w-full h-10 rounded-xl" variant="destructive" onClick={handleRevoke} disabled={actionLoading === "revoke"}>
            {actionLoading === "revoke" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Revoke Trial"}
          </Button>
        </div>

        {/* Audit Logs */}
        {auditLogs.length > 0 && (
          <div className="bg-card border border-border/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Audit History</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="text-xs border-b border-border/30 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.action}</span>
                    <span className="text-muted-foreground">{new Date(log.created_date).toLocaleString()}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{log.details}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}