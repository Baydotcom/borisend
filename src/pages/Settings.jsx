import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, LogOut, Crown, ChevronRight, Shield, Bell, Gift, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/I18nContext";
import AboutSection from "@/components/settings/AboutSection";
import AppearanceSection from "@/components/settings/AppearanceSection";
import DeleteAccountDialog from "@/components/settings/DeleteAccountDialog";
import { Trash2 } from "lucide-react";

const tones = ["romantic", "loving", "warm", "professional", "friendly", "funny", "respectful", "inspirational", "pastoral", "encouraging", "appreciative", "formal", "casual"];
const lengths = ["short", "medium", "long"];

export default function Settings() {
  const { t, lang, setLang, supportedLanguages } = useI18n();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [borisendProfile, setBorisendProfile] = useState(null);
  const [messageLanguages, setMessageLanguages] = useState([]);
  const [settings, setSettings] = useState({
    default_tone: "warm",
    default_length: "medium",
    default_nickname: "",
    signature: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    message_language: "en",
  });

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      if (me.default_tone) setSettings(s => ({ ...s, default_tone: me.default_tone }));
      if (me.default_length) setSettings(s => ({ ...s, default_length: me.default_length }));
      if (me.default_nickname) setSettings(s => ({ ...s, default_nickname: me.default_nickname }));
      if (me.signature) setSettings(s => ({ ...s, signature: me.signature }));
      if (me.timezone) setSettings(s => ({ ...s, timezone: me.timezone }));
      if (me.message_language) setSettings(s => ({ ...s, message_language: me.message_language }));
      try {
        const profiles = await base44.entities.BoriSendProfile.filter({ user_id: me.id }, "-created_date", 5);
        if (profiles[0]) {
          setBorisendProfile(profiles[0]);
          // RC16.8: Authoritative default message language from BoriSendProfile
          if (profiles[0].default_message_language) {
            setSettings(s => ({ ...s, message_language: profiles[0].default_message_language }));
          }
        }
      } catch { /* ignore */ }
      // RC16.8: Load active MessageLanguage catalogue from the authoritative entity
      try {
        const langs = await base44.entities.MessageLanguage.filter({ is_active: true }, "display_order", 100);
        setMessageLanguages(langs || []);
      } catch { /* ignore — fallback below */ }
      setLoading(false);
    };
    load();
  }, []);

  const handleUiLangChange = (newLang) => {
    setLang(newLang);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe(settings);
      // RC16.8: Also persist to BoriSendProfile as the authoritative default_message_language
      if (borisendProfile?.id) {
        await base44.entities.BoriSendProfile.update(borisendProfile.id, {
          default_message_language: settings.message_language,
          timezone: settings.timezone,
        });
      }
      toast({ title: t("saveSettings") });
    } catch (e) {
      toast({ title: "Could not save settings", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    base44.auth.logout("/login");
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div>
      <PageHeader title={t("settingsTitle")} onBack={false} />

      <div className="px-4 py-4 space-y-5">
        {/* Profile — clickable to full profile page */}
        <Link to="/profile" className="block bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm active:scale-[0.99] transition-transform">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground ring-4 ring-primary/10 flex items-center justify-center font-bold text-lg">
              {(borisendProfile?.first_name || user?.full_name || "U")?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{[borisendProfile?.first_name, borisendProfile?.last_name].filter(Boolean).join(" ") || user?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              {borisendProfile?.borisend_user_id && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">BoriSend ID: {borisendProfile.borisend_user_id}</p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          </div>
        </Link>

        {/* Appearance */}
        <AppearanceSection />

        {/* Notification settings */}
        <Link to="/notification-settings" className="block bg-card/90 border border-border/60 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <p className="text-xs text-muted-foreground">Push alerts & preferences</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          </div>
        </Link>

        <Link to="/support" className="block bg-card/90 border border-border/60 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-5 h-5 text-primary" />
              <div><p className="text-sm font-semibold text-foreground">Contact BoriSend</p><p className="text-xs text-muted-foreground">Support messages and replies</p></div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          </div>
        </Link>

        {/* Language & Region */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("languageRegion")}</h3>

          {/* UI Language - immediate switch */}
          <div className="space-y-2">
            <Label>{t("uiLanguage")}</Label>
            <Select value={lang} onValueChange={handleUiLangChange}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {supportedLanguages.map(l => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="mr-2">{l.flag}</span> {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">This changes the BoriSend interface immediately.</p>
          </div>

          {/* Message Language - independent from UI language, saved with settings */}
          <div className="space-y-2">
            <Label>{t("messageLanguage")}</Label>
            <Select
              value={settings.message_language}
              onValueChange={v => setSettings(s => ({ ...s, message_language: v }))}
            >
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {messageLanguages.length > 0 ? messageLanguages.map(l => (
                  <SelectItem key={l.system_key} value={l.system_key}>
                    {l.native_name} {l.native_name !== l.display_name ? `(${l.display_name})` : ''}
                  </SelectItem>
                )) : (
                  <SelectItem value="en">English</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("messageLanguageHint")}</p>
          </div>
        </div>

        {/* Default Preferences */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("defaultPreferences")}</h3>

          <div className="space-y-2">
            <Label>{t("defaultTone")}</Label>
            <Select value={settings.default_tone} onValueChange={v => setSettings(s => ({ ...s, default_tone: v }))}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tones.map(tone => <SelectItem key={tone} value={tone} className="capitalize">{tone}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("defaultMessageLength")}</Label>
            <Select value={settings.default_length} onValueChange={v => setSettings(s => ({ ...s, default_length: v }))}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {lengths.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("preferredNickname")}</Label>
            <Input
              placeholder="e.g. Honey, My Love..."
              value={settings.default_nickname}
              onChange={e => setSettings(s => ({ ...s, default_nickname: e.target.value }))}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>{t("signature")}</Label>
            <Input
              placeholder="e.g. With love, David"
              value={settings.signature}
              onChange={e => setSettings(s => ({ ...s, signature: e.target.value }))}
              className="h-11"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-xl">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {t("saveSettings")}
        </Button>

        <Button variant="outline" onClick={handleLogout} className="w-full h-11 rounded-xl text-destructive border-destructive/20 hover:bg-destructive/5">
          <LogOut className="w-4 h-4 mr-2" /> {t("signOut")}
        </Button>

        {/* Delete Account */}
        <button
        onClick={() => setShowDeleteDialog(true)}
        className="w-full h-11 rounded-xl text-sm font-medium text-destructive border border-destructive/20 hover:bg-destructive/5 flex items-center justify-center gap-2 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Delete account
        </button>

        {/* About & System Information */}
        <AboutSection />
      </div>

      <DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
    </div>
  );
}