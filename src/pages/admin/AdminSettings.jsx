import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import { Loader2, Plus, Trash2, Save } from "lucide-react";

export default function AdminSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      if (me.role !== "admin" && me.role !== "super_admin") { navigate("/"); return; }
      const s = await base44.entities.AppSettings.list("setting_key", 50);
      setSettings(s);
      setLoading(false);
    };
    load();
  }, [navigate]);

  const addSetting = () => {
    setSettings(s => [...s, { setting_key: "", setting_value: "", description: "", isNew: true }]);
  };

  const updateLocal = (index, field, value) => {
    setSettings(s => s.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSave = async () => {
    setSaving(true);
    for (const s of settings) {
      if (s.isNew && s.setting_key.trim()) {
        await base44.entities.AppSettings.create({
          setting_key: s.setting_key,
          setting_value: s.setting_value,
          description: s.description,
        });
      } else if (s.id) {
        await base44.entities.AppSettings.update(s.id, {
          setting_value: s.setting_value,
          description: s.description,
        });
      }
    }
    const refreshed = await base44.entities.AppSettings.list("setting_key", 50);
    setSettings(refreshed);
    toast({ title: "Settings saved" });
    setSaving(false);
  };

  const handleDelete = async (index) => {
    const item = settings[index];
    if (item.id) {
      await base44.entities.AppSettings.delete(item.id);
    }
    setSettings(s => s.filter((_, i) => i !== index));
    toast({ title: "Setting removed" });
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="App settings"
        rightAction={
          <Button size="sm" onClick={addSetting} className="h-8 bg-primary hover:bg-primary/90 rounded-lg text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        <p className="text-xs text-muted-foreground mb-2">
          Configure dynamic app settings like free message allowance, feature flags, and more.
        </p>

        {settings.map((s, i) => (
          <div key={s.id || i} className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Key</Label>
                <Input
                  value={s.setting_key}
                  onChange={e => updateLocal(i, "setting_key", e.target.value)}
                  disabled={!s.isNew}
                  className="h-9 text-sm"
                  placeholder="e.g. free_monthly_limit"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  value={s.setting_value}
                  onChange={e => updateLocal(i, "setting_value", e.target.value)}
                  className="h-9 text-sm"
                  placeholder="e.g. 2"
                />
              </div>
              <button onClick={() => handleDelete(i)} className="self-end p-2 hover:bg-destructive/10 rounded-lg text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={s.description || ""}
                onChange={e => updateLocal(i, "description", e.target.value)}
                className="h-9 text-sm"
                placeholder="What this setting controls..."
              />
            </div>
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving} className="w-full h-11 bg-primary hover:bg-primary/90 rounded-xl">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save all settings
        </Button>
      </div>
    </div>
  );
}