import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/layout/PageHeader";
import ContactPicker from "@/components/contacts/ContactPicker";
import LocationConfigEditor from "@/components/smart-messages/LocationConfigEditor";
import {
  Clock, Calendar, Zap, Repeat, Info, AlertTriangle, MapPin
} from "lucide-react";
import { GeofenceService, PlatformService } from "@/services/mobile";

const TRIGGER_OPTIONS = [
  { type: "manual_event", label: "Manual Event", icon: Zap, desc: "Trigger yourself (e.g. \"Arrived safely\")" },
  { type: "time", label: "Daily / Time", icon: Clock, desc: "At a specific time on selected days" },
  { type: "recurring_date", label: "Recurring Date", icon: Repeat, desc: "Birthdays, anniversaries, monthly" },
  { type: "date", label: "One-Time Date", icon: Calendar, desc: "A specific future date" },
  { type: "location_arrival", label: "Location Arrival", icon: MapPin, desc: "Prepare when you arrive at a selected place" },
  { type: "location_departure", label: "Location Departure", icon: MapPin, desc: "Prepare when you leave a selected place" },
];

const WEEKDAYS = [
  { day: 1, label: "M" }, { day: 2, label: "T" }, { day: 3, label: "W" },
  { day: 4, label: "T" }, { day: 5, label: "F" }, { day: 6, label: "S" }, { day: 0, label: "S" },
];

export default function CreateSmartMessage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [triggerType, setTriggerType] = useState("manual_event");
  const [triggerConfig, setTriggerConfig] = useState({});
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [status, setStatus] = useState("inactive");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [validation, setValidation] = useState({});
  const savingRef = useRef(false);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const sm = await base44.entities.SmartMessage.get(id);
        setName(sm.name || "");
        setDescription(sm.description || "");
        setContent(sm.content || "");
        setTriggerType(sm.trigger_type || "manual_event");
        setTriggerConfig(sm.trigger_config || {});
        setStatus(sm.status || "inactive");

        const recipRes = await base44.functions.invoke("manageSmartMessage", {
          action: "getRecipients", smart_message_id: id,
        });
        setSelectedContactIds((recipRes.data?.recipients || recipRes.recipients || []).map(r => r.contact_id));
      } catch (e) {
        toast({ title: "Could not load", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSave = async (activate = false) => {
    if (savingRef.current) return;
    const errors = {};
    if (!name.trim()) errors.name = "Give this Smart Message a name";
    if (!content.trim()) errors.content = "Enter the message you want BoriSend to send";
    if (selectedContactIds.length === 0) errors.recipients = "Choose at least one recipient";

    if (activate && isLocationTrigger) {
      const cfg = triggerConfig || {};
      if (typeof cfg.location_latitude !== "number" || typeof cfg.location_longitude !== "number") {
        errors.location = "Add a location to activate this Smart Message";
      }
      const r = Number(cfg.location_radius_meters);
      if (!r || r < 50 || r > 1000) {
        errors.location = "Radius must be between 50 and 1000 metres";
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidation(errors);
      toast({ title: Object.values(errors)[0], variant: "destructive" });
      return;
    }
    setValidation({});

    // Contextual native permission request: location permission is requested
    // only when the user explicitly activates a Location Smart Message.
    // Web configuration remains allowed so the geofence can be prepared before
    // installing a native build. On native, do not claim activation if the
    // required geofence bridge is absent or permission is denied.
    if (activate && isLocationTrigger && PlatformService.isNative()) {
      const supported = await GeofenceService.isSupported();
      if (!supported) {
        toast({
          title: "Location trigger unavailable in this build",
          description: "The Smart Message configuration is valid, but this installed app does not include the native geofence capability yet.",
          variant: "destructive",
        });
        return;
      }
      const permission = await GeofenceService.requestPermission();
      if (permission !== "granted") {
        toast({
          title: "Location permission required",
          description: "Allow background location access so BoriSend can detect arrival or departure without the app being open.",
          variant: "destructive",
        });
        return;
      }
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        action: isEdit ? "update" : "create",
        name: name.trim(),
        description: description.trim() || null,
        content: content.trim(),
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        contact_ids: selectedContactIds,
        status: activate ? "active" : status,
      };
      if (isEdit) payload.smart_message_id = id;

      const res = await base44.functions.invoke("manageSmartMessage", payload);
      if (res.data?.success || res.success) {
        toast({
          title: activate ? "Smart Message activated" : "Smart Message saved",
          description: activate ? "It will now fire on its trigger." : undefined,
        });
        if (activate && isLocationTrigger) {
          window.dispatchEvent(new CustomEvent("borisend:geofence-reconcile"));
        }
        navigate("/smart-messages");
      }
    } catch (e) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title={isEdit ? "Edit Smart Message" : "New Smart Message"} />
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const isLocationTrigger = triggerType === "location_arrival" || triggerType === "location_departure";

  return (
    <div className="min-h-screen pb-48">
      <PageHeader title={isEdit ? "Edit Smart Message" : "New Smart Message"} />

      <div className="px-4 pt-4 space-y-6">
        <div className="rounded-3xl bg-card/90 border border-border/60 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">A message for real life</p>
          <p className="text-sm font-semibold mt-1">Set the words once. BoriSend helps you remember the moment.</p>
          <p className="text-xs text-muted-foreground mt-1">You stay in control of the message and sending remains manual.</p>
        </div>
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="sm-name">Name</Label>
          <Input
            id="sm-name"
            value={name}
            onChange={e => { setName(e.target.value); if (validation.name) setValidation(v => ({ ...v, name: undefined })); }}
            placeholder="e.g. Arrived at Work"
            maxLength={80}
          />
          {validation.name && (
            <p className="text-xs text-destructive">{validation.name}</p>
          )}
        </div>

        {/* Recipients */}
        <div className="space-y-2">
          <Label>Recipients</Label>
          <ContactPicker
            selectedIds={selectedContactIds}
            onChange={(ids) => { setSelectedContactIds(ids); if (validation.recipients) setValidation(v => ({ ...v, recipients: undefined })); }}
          />
          {validation.recipients && (
            <p className="text-xs text-destructive">{validation.recipients}</p>
          )}
        </div>

        {/* Content */}
        <div className="space-y-2">
          <Label htmlFor="sm-content">Fixed Message</Label>
          <Textarea
            id="sm-content"
            value={content}
            onChange={e => { setContent(e.target.value); if (validation.content) setValidation(v => ({ ...v, content: undefined })); }}
            placeholder="Write the exact message that will be sent. This text is never generated or changed."
            rows={4}
            className="resize-none"
          />
          {validation.content && (
            <p className="text-xs text-destructive">{validation.content}</p>
          )}
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="w-3 h-3" />
            This is your exact text. It will not be altered by BoriSend.
          </p>
        </div>

        {/* Trigger Type */}
        <div className="space-y-3">
          <Label>Trigger</Label>
          <div className="grid grid-cols-2 gap-2">
            {TRIGGER_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isSelected = triggerType === opt.type;
              return (
                <button
                  key={opt.type}
                  onClick={() => {
                    const isLoc = (t) => t === "location_arrival" || t === "location_departure";
                    setTriggerType(opt.type);
                    setTriggerConfig(prev => (isLoc(opt.type) && isLoc(triggerType) ? prev : {}));
                  }}
                  className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border text-left transition-colors touch-manipulation ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 bg-card/90 hover:bg-muted/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Trigger Config */}
        <TriggerConfigEditor
          triggerType={triggerType}
          config={triggerConfig}
          onChange={setTriggerConfig}
        />

        {/* Location native info */}
        {isLocationTrigger && (
          <div className="bg-info/5 border border-info/20 rounded-xl p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground">Location detection</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                BoriSend detects arrival/departure using your phone's geofence monitoring in the native app. You'll be asked for location permission when you activate this. Sending remains manual.
              </p>
            </div>
          </div>
        )}

        {/* Description (optional) */}
        <div className="space-y-2">
          <Label htmlFor="sm-desc">Description (optional)</Label>
          <Input
            id="sm-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Notes about this Smart Message"
            maxLength={200}
          />
        </div>
      </div>

      {/* Sticky save bar — positioned above MobileNav (4rem = h-16 + safe-area) */}
      <div
        className="fixed left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 h-11 rounded-xl"
          >
            {saving ? "Saving..." : "Save as Draft"}
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 h-11 rounded-xl"
          >
            {saving ? "Saving..." : isEdit && status === "active" ? "Save Changes" : "Save & Activate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TriggerConfigEditor({ triggerType, config, onChange }) {
  const set = (key, value) => onChange({ ...config, [key]: value });

  switch (triggerType) {
    case "manual_event":
      return (
        <div className="space-y-2">
          <Label htmlFor="event-label">Event Label</Label>
          <Input
            id="event-label"
            value={config.manual_event_label || ""}
            onChange={e => set("manual_event_label", e.target.value)}
            placeholder="e.g. Arrived Safely"
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">
            You'll see a "Trigger Now" button to send this message on demand.
          </p>
        </div>
      );

    case "time":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="time-of-day">Time</Label>
            <Input
              id="time-of-day"
              type="time"
              value={config.time_of_day || ""}
              onChange={e => set("time_of_day", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex gap-1.5">
              {WEEKDAYS.map(({ day, label }) => {
                const days = config.recurring_days || [];
                const isSelected = days.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() => {
                      const current = config.recurring_days || [];
                      set("recurring_days", isSelected
                        ? current.filter(d => d !== day)
                        : [...current, day].sort(),
                      );
                    }}
                    className={`flex-1 h-10 rounded-lg text-xs font-medium transition-colors touch-manipulation ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {(config.recurring_days || []).length === 0 ? "Every day" : `${(config.recurring_days || []).length} day(s) selected`}
            </p>
          </div>
        </div>
      );

    case "date":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="specific-date">Date</Label>
            <Input
              id="specific-date"
              type="date"
              value={config.specific_date || ""}
              onChange={e => set("specific_date", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date-time">Time</Label>
            <Input
              id="date-time"
              type="time"
              value={config.time_of_day || "09:00"}
              onChange={e => set("time_of_day", e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Fires once on this date. Does not recur.</p>
        </div>
      );

    case "recurring_date":
      return <RecurringDateConfig config={config} onChange={onChange} />;

    case "location_arrival":
    case "location_departure":
      return <LocationConfigEditor config={config} onChange={onChange} />;

    default:
      return null;
  }
}

function RecurringDateConfig({ config, onChange }) {
  const set = (key, value) => onChange({ ...config, [key]: value });
  const pattern = config.recurring_pattern || "weekly";

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Repeat Pattern</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { val: "weekly", label: "Weekly" },
            { val: "monthly", label: "Monthly" },
            { val: "annual", label: "Annual" },
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => set("recurring_pattern", opt.val)}
              className={`py-2 rounded-lg text-xs font-medium transition-colors touch-manipulation ${
                pattern === opt.val
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recur-time">Time</Label>
        <Input
          id="recur-time"
          type="time"
          value={config.time_of_day || "09:00"}
          onChange={e => set("time_of_day", e.target.value)}
        />
      </div>

      {pattern === "weekly" && (
        <div className="space-y-2">
          <Label>Days</Label>
          <div className="flex gap-1.5">
            {WEEKDAYS.map(({ day, label }) => {
              const days = config.recurring_days || [];
              const isSelected = days.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => {
                    const current = config.recurring_days || [];
                    set("recurring_days", isSelected
                      ? current.filter(d => d !== day)
                      : [...current, day].sort(),
                    );
                  }}
                  className={`flex-1 h-10 rounded-lg text-xs font-medium transition-colors touch-manipulation ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pattern === "monthly" && (
        <div className="space-y-2">
          <Label htmlFor="day-of-month">Day of Month</Label>
          <Input
            id="day-of-month"
            type="number"
            min={1}
            max={31}
            value={config.recurring_day_of_month || 1}
            onChange={e => set("recurring_day_of_month", Number(e.target.value))}
          />
        </div>
      )}

      {pattern === "annual" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="recur-month">Month</Label>
            <Input
              id="recur-month"
              type="number"
              min={1}
              max={12}
              value={config.recurring_month || 1}
              onChange={e => set("recurring_month", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recur-day">Day</Label>
            <Input
              id="recur-day"
              type="number"
              min={1}
              max={31}
              value={config.recurring_day_of_month || 1}
              onChange={e => set("recurring_day_of_month", Number(e.target.value))}
            />
          </div>
        </div>
      )}
    </div>
  );
}