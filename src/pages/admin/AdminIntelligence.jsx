import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { BrainCircuit, CheckCircle2, XCircle, RefreshCw, Save, Gauge, MessageSquareText, ShieldCheck } from "lucide-react";

const defaults = {
  ai_enabled: "true",
  ai_provider: "base44",
  ai_model: "automatic",
  ai_temperature: "0.7",
  ai_max_tokens: "500",
  ai_timeout_seconds: "30",
  ai_retry_count: "2",
};

export default function AdminIntelligence() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [settingsRows, setSettingsRows] = useState([]);
  const [config, setConfig] = useState(defaults);

  const load = async () => {
    setLoading(true);
    try {
      const [f, l, s] = await Promise.all([
        base44.entities.MessageFeedback.list("-created_date", 500).catch(() => []),
        base44.entities.GenerationUsageLedger.list("-created_date", 500).catch(() => []),
        base44.entities.AppSettings.list("setting_key", 100).catch(() => []),
      ]);
      setFeedback(f || []);
      setLedger(l || []);
      setSettingsRows(s || []);
      const next = { ...defaults };
      for (const row of s || []) if (Object.prototype.hasOwnProperty.call(next, row.setting_key)) next[row.setting_key] = row.setting_value;
      setConfig(next);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const quality = useMemo(() => {
    const total = feedback.length;
    const loved = feedback.filter(x => x.rating === "love_it").length;
    const okay = feedback.filter(x => x.rating === "its_okay").length;
    const regenerate = feedback.filter(x => x.rating === "prepare_another").length;
    const success = ledger.filter(x => x.status === "success").length;
    const failed = ledger.filter(x => x.status === "failed").length;
    const fallbackOrValidation = ledger.filter(x => (x.validation_result || "").toLowerCase().includes("invalid") || (x.failure_category || "").includes("validation")).length;
    return {
      total,
      loved,
      okay,
      regenerate,
      loveRate: total ? Math.round((loved / total) * 100) : null,
      successRate: success + failed ? Math.round((success / (success + failed)) * 100) : null,
      fallbackOrValidation,
    };
  }, [feedback, ledger]);

  const runTests = async () => {
    setRunning(true);
    try {
      const r = await base44.functions.invoke("testIntelligencePipeline", {});
      setTests(r?.data || r);
      toast({ title: r?.data?.all_passed ? "Intelligence checks passed" : "Intelligence checks need attention" });
    } catch (e) {
      toast({ title: "Could not run intelligence checks", description: e.message, variant: "destructive" });
    } finally { setRunning(false); }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(config)) {
        const existing = settingsRows.find(x => x.setting_key === key);
        const payload = { setting_value: String(value), description: `Message intelligence setting: ${key}` };
        if (existing?.id) await base44.entities.AppSettings.update(existing.id, payload);
        else await base44.entities.AppSettings.create({ setting_key: key, ...payload });
      }
      toast({ title: "Message intelligence settings saved" });
      await load();
    } catch (e) {
      toast({ title: "Could not save settings", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader title="Message intelligence" />
      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-primary" /><h2 className="font-semibold">Intelligence verification</h2></div>
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">Runs the deterministic relationship strategy, safety, memory, intent and rhythm checks that sit before message generation. Use this after intelligence changes to catch regressions.</p>
            </div>
            <Button onClick={runTests} disabled={running}>{running ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}Run checks</Button>
          </div>
          {tests && <div className="mt-5 space-y-2">{tests.results?.map((r, i) => <div key={i} className="flex items-start gap-3 rounded-xl border p-3">{r.passed ? <CheckCircle2 className="w-4 h-4 text-success mt-0.5" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5" />}<div><p className="text-sm font-medium">{r.test}</p><p className="text-xs text-muted-foreground mt-1">{r.detail}</p></div></div>)}</div>}
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric icon={Gauge} label="Generation success" value={quality.successRate == null ? "No data" : `${quality.successRate}%`} />
          <Metric icon={MessageSquareText} label="Loved messages" value={quality.loveRate == null ? "No feedback" : `${quality.loveRate}%`} />
          <Metric icon={RefreshCw} label="Prepare another" value={quality.total ? quality.regenerate : "No feedback"} />
          <Metric icon={ShieldCheck} label="Validation issues" value={quality.fallbackOrValidation} />
        </section>

        <section className="rounded-2xl border bg-card p-5 space-y-4">
          <div><h2 className="font-semibold">Provider controls</h2><p className="text-sm text-muted-foreground mt-1">These settings tune expression quality and resilience. Relationship strategy and safety rules remain code-controlled so a tuning change cannot bypass them.</p></div>
          <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium">Generation enabled</p><p className="text-xs text-muted-foreground">Master switch for generated messages.</p></div><Switch checked={config.ai_enabled !== "false"} onCheckedChange={v => setConfig(c => ({ ...c, ai_enabled: v ? "true" : "false" }))} /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Provider" value={config.ai_provider} onChange={v => setConfig(c => ({ ...c, ai_provider: v }))} />
            <Field label="Model" value={config.ai_model} onChange={v => setConfig(c => ({ ...c, ai_model: v }))} />
            <Field label="Temperature" value={config.ai_temperature} onChange={v => setConfig(c => ({ ...c, ai_temperature: v }))} type="number" step="0.1" />
            <Field label="Maximum tokens" value={config.ai_max_tokens} onChange={v => setConfig(c => ({ ...c, ai_max_tokens: v }))} type="number" />
            <Field label="Timeout seconds" value={config.ai_timeout_seconds} onChange={v => setConfig(c => ({ ...c, ai_timeout_seconds: v }))} type="number" />
            <Field label="Retry count" value={config.ai_retry_count} onChange={v => setConfig(c => ({ ...c, ai_retry_count: v }))} type="number" />
          </div>
          <Button onClick={saveConfig} disabled={saving}><Save className="w-4 h-4 mr-2" />Save intelligence settings</Button>
        </section>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) { return <div className="rounded-2xl border bg-card p-4"><Icon className="w-4 h-4 text-primary mb-3" /><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></div>; }
function Field({ label, value, onChange, type = "text", step }) { return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} step={step} value={value} onChange={e => onChange(e.target.value)} /></div>; }
