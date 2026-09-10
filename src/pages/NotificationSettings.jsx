import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, Bell, Smartphone, ShieldCheck, BellOff, Save } from "lucide-react";
import { NotificationService, PermissionService, PlatformService } from "@/services/mobile";
import DeviceInfoCard from "@/components/mobile/DeviceInfoCard";

export default function NotificationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("prompt");
  const [prefs, setPrefs] = useState(NotificationService.getDefaultPreferences());
  const categories = NotificationService.getCategories();
  const platformLabel = PlatformService.getLabel();

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      const userPrefs = NotificationService.getDefaultPreferences();
      Object.keys(userPrefs).forEach((key) => {
        if (me[key] !== undefined && me[key] !== null) {
          userPrefs[key] = me[key];
        }
      });
      setPrefs(userPrefs);

      const status = await PermissionService.check("notifications");
      setPermissionStatus(status);
      setLoading(false);
    };
    load();
  }, []);

  const handleRequestPermission = async () => {
    const result = await PermissionService.request("notifications");
    setPermissionStatus(result);

    if (result === "granted" || result === "not_implemented") {
      if (PlatformService.isNative()) {
        const regResult = await NotificationService.registerForPush();
        if (regResult.success) {
          toast({ title: "Push notifications enabled" });
        }
      }
      setPrefs((p) => ({ ...p, push_enabled: true }));
      await base44.auth.updateMe({ push_enabled: true });
    }
  };

  const handleToggle = (key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe(prefs);
    toast({ title: "Notification preferences saved" });
    setSaving(false);
  };

  if (loading) {
    return <PageLoader />;
  }

  const isGranted = permissionStatus === "granted" || permissionStatus === "not_implemented";

  return (
    <div>
      <PageHeader title="Notification Settings" />

      <div className="px-4 py-4 space-y-5">
        <div className="bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Stay in the moment</p>
          <p className="text-sm font-semibold mt-1">Choose the reminders that help you follow through.</p>
          <div className="mt-3"><span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-xs font-medium text-muted-foreground"><Smartphone className="w-3 h-3" />{platformLabel}</span></div>
        </div>

        {/* Device info & permissions */}
        <DeviceInfoCard />

        {/* Permission status */}
        <div className="bg-card/90 border border-border/60 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            {isGranted ? (
              <ShieldCheck className="w-5 h-5 text-success" />
            ) : (
              <BellOff className="w-5 h-5 text-warning" />
            )}
            <h3 className="font-semibold text-sm">Permission Status</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {isGranted
              ? "Notifications are enabled on this device."
              : permissionStatus === "denied"
              ? "Notifications are blocked. Enable them in your device settings."
              : "Allow notifications to receive alerts when messages are ready."}
          </p>
          {!isGranted && permissionStatus !== "not_supported" && (
            <Button
              onClick={handleRequestPermission}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90"
            >
              <Bell className="w-4 h-4 mr-2" /> Enable Notifications
            </Button>
          )}
        </div>

        {/* Push notification master toggle */}
        <div className="bg-card/90 border border-border/60 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  prefs.push_enabled
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground">Receive alerts on your device</p>
              </div>
            </div>
            <Switch
              checked={prefs.push_enabled}
              onCheckedChange={(v) => handleToggle("push_enabled", v)}
            />
          </div>
        </div>

        {/* Notification categories */}
        <div className="bg-card/90 border border-border/60 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-1">Notification Types</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Choose which alerts you want to receive.
          </p>
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{cat.label}</p>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </div>
                <Switch
                  checked={prefs[`notif_${cat.key}`]}
                  onCheckedChange={(v) => handleToggle(`notif_${cat.key}`, v)}
                />
              </div>
            ))}
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}