import React, { useState } from "react";
import { Check, X, Pencil, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const REWARD_TYPES = ["message_credits", "subscription_days", "cash_payout", "feature_unlock"];

export default function AdminConfigEditor({ configs, onUpdated }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");

  const startEdit = (config) => {
    setEditingId(config.id);
    setEditValue(config.value);
    setEditActive(config.is_active);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
    setError("");
  };

  const handleSave = async (configId) => {
    setSaving(configId);
    setError("");
    try {
      const response = await base44.functions.invoke('adminUpdateReferralConfig', {
        config_id: configId,
        value: editValue,
        is_active: editActive
      });
      if (response.data?.error) {
        setError(response.data.error);
        toast({ title: "Validation failed", variant: "destructive" });
      } else {
        toast({ title: "Configuration updated" });
        setEditingId(null);
        if (onUpdated) onUpdated();
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Update failed";
      setError(msg);
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (!configs || configs.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">No configuration set</p>;
  }

  const isBooleanKey = (key) => key.endsWith('_enabled') || key === 'program_is_active';
  const isTypeKey = (key) => key.endsWith('_type');
  const isAmountKey = (key) => key.endsWith('_amount');
  const isDaysKey = (key) => key.endsWith('_days');

  return (
    <div className="space-y-2">
      {configs.map(c => (
        <div key={c.id} className="bg-card border border-border/50 rounded-xl p-3">
          {editingId === c.id ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{c.key}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSave(c.id)}
                    disabled={saving === c.id}
                    className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-200"
                  >
                    {saving === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="w-7 h-7 rounded-lg bg-red-100 text-red-700 flex items-center justify-center hover:bg-red-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isBooleanKey(c.key) ? (
                <select
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : isTypeKey(c.key) ? (
                <select
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {REWARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input
                  type={isAmountKey(c.key) || isDaysKey(c.key) ? "number" : "text"}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  step={isAmountKey(c.key) ? "0.01" : "1"}
                  min={isDaysKey(c.key) ? "1" : undefined}
                />
              )}

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={e => setEditActive(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Active
              </label>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.key}</p>
                <p className="text-xs text-muted-foreground truncate">{c.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-medium">{c.value}</p>
                  <span className={`text-[10px] ${c.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <button
                  onClick={() => startEdit(c)}
                  className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}