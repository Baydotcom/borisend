import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, Mail, Phone, Globe, Clock, Calendar, ShieldCheck, Lock } from "lucide-react";
import { useI18n } from "@/lib/I18nContext";

const commonTimezones = [
  "Europe/London", "Europe/Paris", "Europe/Madrid", "Europe/Berlin", "Europe/Rome",
  "Europe/Amsterdam", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Sao_Paulo", "Africa/Lagos", "Africa/Johannesburg",
  "Asia/Dubai", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney", "UTC",
];

export default function Profile() {
  const { t, supportedLanguages } = useI18n();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    timezone: "UTC",
    preferred_locale: "en",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        await base44.functions.invoke("ensureBoriSendProfile", {}).catch(() => null);
        const profiles = await base44.entities.BoriSendProfile.filter({ user_id: me.id }, "-created_date", 5);
        const p = profiles[0] || null;
        setProfile(p);
        if (p) {
          setForm({
            first_name: p.first_name || "",
            last_name: p.last_name || "",
            timezone: p.timezone || me.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            preferred_locale: p.preferred_locale || me.message_language || me.language || "en",
          });
        }
      } catch (e) {
        console.error("Profile load failed:", e);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("updateMyProfile", form);
      const updatedProfile = res.data?.profile || res?.profile || null;
      if (updatedProfile) setProfile(updatedProfile);
      const fullName = [form.first_name, form.last_name].filter(Boolean).join(" ").trim();
      if (fullName) {
        await base44.auth.updateMe({ full_name: fullName, timezone: form.timezone });
        setUser(u => ({ ...u, full_name: fullName, timezone: form.timezone }));
      }
      setEditMode(false);
      toast({ title: "Profile updated" });
    } catch (e) {
      toast({ title: "Could not update profile", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user?.full_name || "User";

  return (
    <div>
      <PageHeader
        title="My Profile"
        rightAction={
          !editMode && (
            <Button size="sm" variant="ghost" onClick={() => setEditMode(true)} className="h-8 text-primary">
              Edit
            </Button>
          )
        }
      />

      <div className="px-4 py-4 space-y-4">
        {/* Identity Card */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground ring-4 ring-primary/10 shadow-sm flex items-center justify-center font-bold text-2xl">
              {(displayName[0] || "U").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Your BoriSend identity</p>
              <h2 className="text-xl font-heading font-semibold truncate">{displayName}</h2>
              {profile?.profile_status === "active" && (
                <span className="inline-flex items-center gap-1 text-xs text-success font-medium mt-0.5">
                  <ShieldCheck className="w-3 h-3" /> Active
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* Email — read-only, owned by auth system */}
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Login email</p>
                <p className="text-sm font-medium truncate">{user?.email || "—"}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Read-only — this is your login email
                </p>
              </div>
            </div>

            {/* BoriSend ID — read-only, immutable */}
            {profile?.borisend_user_id && (
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">BoriSend ID</p>
                  <p className="text-sm font-medium font-mono">{profile.borisend_user_id}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Read-only — unique reference</p>
                </div>
              </div>
            )}

            {/* Registration date */}
            {user?.created_date && (
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Member since</p>
                  <p className="text-sm font-medium">
                    {new Date(user.created_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Editable fields */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-5 space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t("profile")}</h3>

          {editMode ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("firstName")}</Label>
                  <Input
                    value={form.first_name}
                    onChange={e => setForm(s => ({ ...s, first_name: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("lastName")}</Label>
                  <Input
                    value={form.last_name}
                    onChange={e => setForm(s => ({ ...s, last_name: e.target.value }))}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("timezone")}</Label>
                <Select value={form.timezone} onValueChange={v => setForm(s => ({ ...s, timezone: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {commonTimezones.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Interface language</Label>
                <Select value={form.preferred_locale} onValueChange={v => setForm(s => ({ ...s, preferred_locale: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map(l => (
                      <SelectItem key={l.code} value={l.code}>
                        <span className="mr-2">{l.flag}</span> {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">This changes the language used by the BoriSend interface. Your generated-message language is managed separately in Settings.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 rounded-xl">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {t("save")}
                </Button>
                <Button variant="outline" onClick={() => setEditMode(false)} className="h-11 rounded-xl">
                  {t("cancel")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("firstName")}</p>
                  <p className="text-sm font-medium">{profile?.first_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("lastName")}</p>
                  <p className="text-sm font-medium">{profile?.last_name || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("timezone")}</p>
                    <p className="text-sm font-medium">{profile?.timezone || user?.timezone || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Interface language</p>
                    <p className="text-sm font-medium">
                      {supportedLanguages.find(l => l.code === (profile?.preferred_locale || "en"))?.label || "English"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}