import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Heart, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import StartupScreen from "@/components/StartupScreen";

const COMMON_TIMEZONES = [
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney",
  "UTC",
];

export default function ProfileCompletion({ children }) {
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    timezone: "",
    preferred_locale: "en",
  });

  useEffect(() => {
    const check = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const profiles = await base44.entities.BoriSendProfile.filter({ user_id: me.id }, "-created_date", 5);
        if (profiles[0]) {
          setProfile(profiles[0]);
          if (profiles[0].onboarding_status === "complete") {
            // Already complete — render children
            setLoading(false);
            return;
          }
          setForm({
            first_name: profiles[0].first_name || me?.full_name?.split(" ")[0] || "",
            last_name: profiles[0].last_name || me?.full_name?.split(" ").slice(1).join(" ") || "",
            timezone: profiles[0].timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            preferred_locale: profiles[0].preferred_locale || "en",
          });
        } else {
          // No profile yet — ensure one exists
          try {
            await base44.functions.invoke("ensureBoriSendProfile", {});
            const refreshed = await base44.entities.BoriSendProfile.filter({ user_id: me.id }, "-created_date", 5);
            if (refreshed[0]) setProfile(refreshed[0]);
          } catch { /* ignore — will retry on submit */ }
          setForm({
            first_name: me?.full_name?.split(" ")[0] || "",
            last_name: me?.full_name?.split(" ").slice(1).join(" ") || "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            preferred_locale: "en",
          });
        }
      } catch {
        // If we can't even get the user, just render children (auth will handle)
      }
      setLoading(false);
    };
    check();
  }, []);

  const handleSubmit = async () => {
    if (!form.first_name.trim()) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (profile) {
        await base44.entities.BoriSendProfile.update(profile.id, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          timezone: form.timezone,
          preferred_locale: form.preferred_locale,
          onboarding_status: "complete",
        });
      } else {
        // Ensure profile exists then update
        await base44.functions.invoke("ensureBoriSendProfile", {});
        const me = await base44.auth.me();
        const profiles = await base44.entities.BoriSendProfile.filter({ user_id: me.id }, "-created_date", 5);
        if (profiles[0]) {
          await base44.entities.BoriSendProfile.update(profiles[0].id, {
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            timezone: form.timezone,
            preferred_locale: form.preferred_locale,
            onboarding_status: "complete",
          });
        }
      }
      const fullName = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ");
      await base44.auth.updateMe({ full_name: fullName, timezone: form.timezone, message_language: form.preferred_locale }).catch(() => null);
      base44.analytics?.track?.({ eventName: "profile_completed" });
      // Reload to transition to normal app
      window.location.href = "/";
    } catch (e) {
      toast({ title: "Could not save profile", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <StartupScreen />;
  }

  // If profile is complete or doesn't need completion, render children
  if (profile?.onboarding_status === "complete" || !profile) {
    return children;
  }

  // Show profile completion form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-card border border-border/60 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-heading font-semibold mb-2">Let's get to know you</h1>
          <p className="text-sm text-muted-foreground">
            Tell us a bit about yourself so BoriSend can personalise your experience.
          </p>
        </div>

        <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{form.first_name ? "First name" : "First name *"}</Label>
              <Input
                value={form.first_name}
                onChange={e => setForm({ ...form, first_name: e.target.value })}
                className="h-10"
                placeholder="Sarah"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Last name</Label>
              <Input
                value={form.last_name}
                onChange={e => setForm({ ...form, last_name: e.target.value })}
                className="h-10"
                placeholder="Johnson"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Timezone</Label>
            <Select value={form.timezone} onValueChange={v => setForm({ ...form, timezone: v })}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select timezone" /></SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Language</Label>
            <Select value={form.preferred_locale} onValueChange={v => setForm({ ...form, preferred_locale: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="pt">Português</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="it">Italiano</SelectItem>
                <SelectItem value="nl">Nederlands</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSubmit} disabled={saving} className="w-full h-11 rounded-xl mt-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Complete profile <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {profile?.borisend_user_id && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Your BoriSend ID: {profile.borisend_user_id}
          </p>
        )}
      </div>
    </div>
  );
}