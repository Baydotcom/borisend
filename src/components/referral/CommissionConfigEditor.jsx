import React, { useState } from "react";
import { Loader2, Save, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

export default function CommissionConfigEditor({ config, onUpdated }) {
  const [form, setForm] = useState(config || {});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const response = await base44.functions.invoke('adminUpdateCommissionConfig', form);
      if (response.data?.error) {
        setErrors(response.data.validation_errors || [response.data.error]);
        toast({ title: "Validation failed", variant: "destructive" });
      } else {
        toast({ title: "Commission configuration saved" });
        if (onUpdated) onUpdated();
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Save failed";
      setErrors(e?.response?.data?.validation_errors || [msg]);
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Explanatory note */}
      <div className="bg-blue-50 border border-blue-200/50 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p><strong>Fixed months</strong> = commission expires after the configured number of paid billing cycles.</p>
            <p><strong>Lifetime</strong> = commission continues while the referred user remains eligible.</p>
            <p>No real payout provider is connected yet — rewards are tracked as ledger entries only.</p>
          </div>
        </div>
      </div>

      {/* Master switch */}
      <div className="bg-card border border-border/50 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Commission enabled</p>
          <p className="text-xs text-muted-foreground">Master switch for recurring commission</p>
        </div>
        <button
          onClick={() => update("commission_enabled", !form.commission_enabled)}
          className={`w-11 h-6 rounded-full transition-colors relative ${form.commission_enabled ? "bg-emerald-500" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.commission_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Commission type */}
      <div className="bg-card border border-border/50 rounded-xl p-3 space-y-3">
        <p className="text-sm font-medium">Commission type</p>
        <select
          value={form.commission_type || "percentage"}
          onChange={e => update("commission_type", e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="percentage">Percentage of payment</option>
          <option value="fixed_amount">Fixed amount per cycle</option>
        </select>

        {form.commission_type === "percentage" ? (
          <div>
            <label className="text-xs text-muted-foreground">Percentage rate (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.commission_percentage ?? 10}
              onChange={e => update("commission_percentage", parseFloat(e.target.value))}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
            />
          </div>
        ) : (
          <div>
            <label className="text-xs text-muted-foreground">Fixed amount per billing cycle (£)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.commission_fixed_amount ?? 0}
              onChange={e => update("commission_fixed_amount", parseFloat(e.target.value))}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
            />
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="bg-card border border-border/50 rounded-xl p-3 space-y-3">
        <p className="text-sm font-medium">Duration</p>
        <select
          value={form.duration_type || "fixed_months"}
          onChange={e => update("duration_type", e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="fixed_months">Fixed months (expires after N cycles)</option>
          <option value="lifetime">Lifetime (while eligible)</option>
        </select>

        {form.duration_type === "fixed_months" && (
          <div>
            <label className="text-xs text-muted-foreground">Number of billing cycles</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.duration_months ?? 12}
              onChange={e => update("duration_months", parseInt(e.target.value))}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">e.g. 24 = 24 monthly payments or 2 yearly payments</p>
          </div>
        )}
      </div>

      {/* Eligibility */}
      <div className="bg-card border border-border/50 rounded-xl p-3 space-y-3">
        <p className="text-sm font-medium">Eligibility</p>

        <div>
          <label className="text-xs text-muted-foreground">Eligible billing periods</label>
          <select
            value={form.eligible_billing_periods || "both"}
            onChange={e => update("eligible_billing_periods", e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
          >
            <option value="both">Both (monthly + yearly)</option>
            <option value="monthly">Monthly only</option>
            <option value="yearly">Yearly only</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Commission starts after</label>
          <select
            value={form.commission_starts_after || "first_payment"}
            onChange={e => update("commission_starts_after", e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
          >
            <option value="first_payment">First payment</option>
            <option value="trial_end">Trial end (first renewal)</option>
            <option value="subscription_activation">Subscription activation</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Minimum payment threshold (£, optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.minimum_payment_threshold ?? ""}
            onChange={e => update("minimum_payment_threshold", e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="No minimum"
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Max commission cap per referred user (£, optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.max_commission_cap ?? ""}
            onChange={e => update("max_commission_cap", e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="No cap"
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.require_active_subscription ?? true}
            onChange={e => update("require_active_subscription", e.target.checked)}
            className="w-3.5 h-3.5"
          />
          Require active paid subscription
        </label>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-xs font-medium text-red-700 mb-1">Validation errors:</p>
          <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save commission rules
      </button>
    </div>
  );
}