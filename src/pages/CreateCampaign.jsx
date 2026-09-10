import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, Plus, Trash2, Users, User, Check, AlertCircle, Heart, CalendarClock, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/I18nContext";
import RelationshipQuestions from "@/components/relationship/RelationshipQuestions";
import { getQuestionSet } from "@/lib/relationshipQuestions";
import DeviceContactPicker from "@/components/contacts/DeviceContactPicker";
import PlatformService from "@/services/mobile/PlatformService";

const CATEGORY_TO_LEGACY = {
  romantic_marital: "love_messages",
  parent_child: "family_checkins",
  family_extended: "family_checkins",
  friendship_personal: "daily_encouragement",
  workplace_professional: "employee_appreciation",
  business_customer: "customer_retention",
  faith_spiritual: "prayer_reminders",
  community_social: "daily_encouragement",
  education_development: "daily_encouragement",
  care_support: "daily_encouragement",
  membership_organisation: "church_followup",
  network_influence: "client_management",
};

const tones = ["romantic", "loving", "warm", "professional", "friendly", "funny", "respectful", "inspirational", "pastoral", "encouraging", "appreciative", "formal", "casual"];

const stateDescriptions = {
  new: "This is a new connection you'd like to nurture.",
  active: "Things are generally going well and you want to keep the relationship strong.",
  neglected: "It's been a while since you've been in touch.",
  distant: "You are still connected, but there is noticeable distance or reduced communication.",
  strained: "There has been tension or difficulty recently.",
  rebuilding: "You're working on repairing and rebuilding the connection.",
};

const scheduleTypes = [
  { value: "specific_daily", label: "Every day at a specific time" },
  { value: "random_daily", label: "Random time every day" },
  { value: "twice_daily", label: "Twice daily" },
  { value: "weekly", label: "Weekly" },
  { value: "every_friday", label: "Every Friday" },
  { value: "monthly", label: "Monthly" },
  { value: "selected_weekdays", label: "Selected weekdays" },
  { value: "custom", label: "Custom schedule" },
];

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CreateCampaign() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useI18n();
  const isEditing = Boolean(id);
  const packagedMobile = PlatformService.isIOS() || PlatformService.isAndroid();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingCampaign, setLoadingCampaign] = useState(isEditing);
  const [campaignLimit, setCampaignLimit] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [taxonomy, setTaxonomy] = useState({ categories: [], types: [], states: [], goals: [] });
  const [eligibleGoalIds, setEligibleGoalIds] = useState(null);
  const [rhythmRec, setRhythmRec] = useState(null);
  const [showSafety, setShowSafety] = useState(false);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [contextAnswers, setContextAnswers] = useState({});
  const [rhythmMode, setRhythmMode] = useState(isEditing ? "custom" : null);
  const [messageLanguages, setMessageLanguages] = useState([]);
  const [form, setForm] = useState({
    name: "",
    relationship_category_id: "",
    relationship_category_system_key: "",
    relationship_type_id: "",
    relationship_state_id: "",
    relationship_goal_id: "",
    message_mode: "personalised",
    category: "custom",
    purpose: "",
    tone: "warm",
    message_length: "medium",
    writing_style: "conversational",
    pet_name: "",
    additional_instructions: "",
    recipients: [{ name: "", phone: "" }],
    schedule_type: "weekly",
    schedule_time: "09:00",
    schedule_days: [],
    approval_mode: "manual",
    status: "active",
    message_language: "use_default",
    trigger_type: "scheduled",
    trigger_config: {},
  });

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // Load taxonomy + contacts
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [cats, states, goals, cts, langs, me] = await Promise.all([
          base44.entities.RelationshipCategory.list("display_order", 50),
          base44.entities.RelationshipState.list("display_order", 50),
          base44.entities.RelationshipGoal.list("display_order", 50),
          base44.entities.Contact.list("-created_date", 200).catch(() => []),
          base44.entities.MessageLanguage.filter({ is_active: true }, "display_order", 100).catch(() => []),
          base44.auth.me().catch(() => null),
        ]);
        setTaxonomy(prev => ({ ...prev, categories: cats, states, goals }));
        setContacts(cts);
        setMessageLanguages(langs || []);
        if (!isEditing && me) {
          setForm(f => ({
            ...f,
            tone: me.default_tone || f.tone,
            message_length: me.default_length || f.message_length,
            pet_name: me.default_nickname || f.pet_name,
          }));
        }
      } catch { /* ignore */ }
    };
    loadAll();
  }, []);

  const reloadContacts = async () => {
    try {
      const cts = await base44.entities.Contact.list("-created_date", 200);
      setContacts(cts);
    } catch { /* ignore */ }
  };

  // Load types when category changes
  useEffect(() => {
    if (!form.relationship_category_id) return;
    const loadTypes = async () => {
      try {
        const types = await base44.entities.RelationshipType.filter(
          { category_id: form.relationship_category_id, is_active: true },
          "display_order", 100
        );
        setTaxonomy(prev => ({ ...prev, types }));
        if (!isEditing) update("relationship_type_id", types[0]?.id || "");
      } catch { setTaxonomy(prev => ({ ...prev, types: [] })); }
    };
    loadTypes();
  }, [form.relationship_category_id]);

  // Load goal eligibility when category+type changes
  useEffect(() => {
    if (!form.relationship_category_system_key) { setEligibleGoalIds(null); return; }
    const loadEligibility = async () => {
      try {
        const typeObj = taxonomy.types.find(ty => ty.id === form.relationship_type_id);
        const res = await base44.functions.invoke("getRelationshipIntelligence", {
          relationship_category: form.relationship_category_system_key,
          relationship_type: typeObj?.system_key || "",
        });
        const eligibleKeys = res.data?.eligible_goals || [];
        const eligibleIds = (taxonomy.goals || []).filter(g => eligibleKeys.includes(g.system_key)).map(g => g.id);
        setEligibleGoalIds(eligibleIds);
      } catch { setEligibleGoalIds(null); }
    };
    loadEligibility();
  }, [form.relationship_category_system_key, form.relationship_type_id, taxonomy.goals, taxonomy.types]);

  // Load rhythm recommendation when type+state+goal changes
  useEffect(() => {
    if (!form.relationship_type_id || !form.relationship_state_id || !form.relationship_goal_id) { setRhythmRec(null); return; }
    const loadRhythm = async () => {
      try {
        const typeObj = taxonomy.types.find(ty => ty.id === form.relationship_type_id);
        const stateObj = taxonomy.states.find(s => s.id === form.relationship_state_id);
        const goalObj = taxonomy.goals.find(g => g.id === form.relationship_goal_id);
        const res = await base44.functions.invoke("getRelationshipIntelligence", {
          relationship_category: form.relationship_category_system_key,
          relationship_type: typeObj?.system_key || "",
          relationship_state: stateObj?.system_key || "",
          relationship_goal: goalObj?.system_key || "",
        });
        if (res.data?.rhythm) setRhythmRec(res.data.rhythm);
      } catch { setRhythmRec(null); }
    };
    loadRhythm();
  }, [form.relationship_type_id, form.relationship_state_id, form.relationship_goal_id, taxonomy]);

  // Safety check when state+goal indicate boundary consideration
  useEffect(() => {
    const stateObj = taxonomy.states.find(s => s.id === form.relationship_state_id);
    const goalObj = taxonomy.goals.find(g => g.id === form.relationship_goal_id);
    const needsBoundaryCheck =
      (stateObj?.system_key === "strained" || stateObj?.system_key === "distant") &&
      (goalObj?.system_key === "reconnect" || goalObj?.system_key === "rebuild_trust_gradually");
    setShowSafety(needsBoundaryCheck);
    if (!needsBoundaryCheck) setSafetyConfirmed(false);
  }, [form.relationship_state_id, form.relationship_goal_id, taxonomy]);

  // Check capacity limit
  useEffect(() => {
    if (isEditing) {
      const load = async () => {
        try {
          const c = await base44.entities.Campaign.get(id);
          setForm({
            name: c.name || "", relationship_category_id: c.relationship_category_id || "",
            relationship_category_system_key: c.relationship_category_system_key || "",
            relationship_type_id: c.relationship_type_id || "", relationship_state_id: c.relationship_state_id || "",
            relationship_goal_id: c.relationship_goal_id || "", message_mode: c.message_mode || "personalised",
            category: c.category || "custom", purpose: c.purpose || "", tone: c.tone || "warm",
            message_length: c.message_length || "medium", writing_style: c.writing_style || "conversational",
            pet_name: c.pet_name || "", additional_instructions: c.additional_instructions || "",
            recipients: c.recipients?.length ? c.recipients : [{ name: "", phone: "" }],
            schedule_type: c.schedule_type || "weekly", schedule_time: c.schedule_time || "09:00",
            schedule_days: c.schedule_days || [], approval_mode: c.approval_mode || "manual", status: c.status || "active",
            message_language: c.message_language || "use_default",
            trigger_type: c.trigger_type || "scheduled",
            trigger_config: c.trigger_config || {},
          });
        } catch { navigate(`/campaigns/${id}`); }
        finally { setLoadingCampaign(false); }
      };
      load();
      return;
    }
    const checkLimit = async () => {
      try {
        const usageRes = await base44.functions.invoke("getUsageStats", {});
        const maxPlans = usageRes.data?.maxCommunicationPlans ?? 1;
        const currentPlans = usageRes.data?.currentCommunicationPlans ?? 0;
        if (currentPlans >= maxPlans) setCampaignLimit(maxPlans);
      } catch { /* ignore */ }
    };
    checkLimit();
  }, [id]);

  const onPickCategory = (cat) => {
    setForm(f => ({
      ...f, relationship_category_id: cat.id, relationship_category_system_key: cat.system_key,
      category: CATEGORY_TO_LEGACY[cat.system_key] || "custom",
    }));
  };

  const addRecipient = () => setForm(f => ({ ...f, recipients: [...f.recipients, { name: "", phone: "" }] }));
  const removeRecipient = (i) => setForm(f => ({ ...f, recipients: f.recipients.filter((_, idx) => idx !== i) }));
  const updateRecipient = (i, field, val) => setForm(f => {
    const r = [...f.recipients]; r[i] = { ...r[i], [field]: val }; return { ...f, recipients: r };
  });
  const selectContact = (c) => {
    const exists = form.recipients.some(r => r.name === (c.display_name || c.first_name));
    if (exists) {
      setForm(f => ({ ...f, recipients: f.recipients.filter(r => r.name !== (c.display_name || c.first_name)) }));
    } else {
      setForm(f => ({ ...f, recipients: [...f.recipients, { name: c.display_name || c.first_name, phone: c.phone_number || "" }] }));
    }
  };
  const toggleDay = (day) => setForm(f => ({
    ...f, schedule_days: f.schedule_days.includes(day) ? f.schedule_days.filter(d => d !== day) : [...f.schedule_days, day],
  }));

  const steps = ["Relationship", "People", "Direction", "Context", "Approach", "Style", "Review"];

  const canProceed = () => {
    if (campaignLimit !== null) return false;
    if (step === 0) return form.relationship_category_id !== "" && form.relationship_type_id !== "";
    if (step === 1) return form.recipients.some(r => r.name.trim() !== "");
    if (step === 2) {
      if (showSafety && !safetyConfirmed) return false;
      return form.relationship_state_id !== "" && form.relationship_goal_id !== "";
    }
    // Step 3 (Context questions) — all optional, always allow proceeding
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // RC16.2: Convert context answers to PlanRecipient-scoped memory payloads
    const questionSet = getQuestionSet(form.relationship_category_system_key);
    const contextAnswersArray = Object.entries(contextAnswers)
      .filter(([_, v]) => v && v.trim())
      .map(([qid, val]) => {
        const q = questionSet.questions.find(qx => qx.id === qid);
        const entry = { question_id: qid, content: val.trim(), memory_type: q?.memory_type || 'fact' };
        if (q?.type === 'date') entry.related_date = val.trim();
        return entry;
      });
    const cleanRecipients = form.recipients.filter(r => r.name.trim() !== "");
    // A Communication Plan must always have a usable display name. Keep an
    // explicit user-entered name when supplied; otherwise derive a stable name
    // from the selected relationship/recipient so every surface reads the same
    // source of truth and legacy-style blank names cannot be created.
    const explicitName = String(form.name || "").trim();
    const derivedName = cleanRecipients.length === 1
      ? `Plan with ${cleanRecipients[0].name.trim()}`
      : (selectedType?.display_label || taxonomy.categories.find(c => c.id === form.relationship_category_id)?.display_name || "Communication Plan");
    const data = { ...form, name: explicitName || derivedName, recipients: cleanRecipients, relationship_context_answers: contextAnswersArray };
      if (isEditing) {
        await base44.functions.invoke("manageCampaign", { action: "update", campaign_id: id, data });
        toast({ title: "Routine updated" });
        navigate(`/campaigns/${id}`);
      } else {
        await base44.functions.invoke("manageCampaign", { action: "create", data });
        base44.analytics?.track?.({ eventName: "communication_plan_created" });
        toast({ title: "Routine created" });
        navigate("/campaigns");
      }
    } catch (error) {
      toast({ title: isEditing ? "Could not update routine" : "Could not create routine", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loadingCampaign) {
    return <PageLoader />;
  }

  const selectedType = taxonomy.types.find(ty => ty.id === form.relationship_type_id);
  const selectedState = taxonomy.states.find(s => s.id === form.relationship_state_id);
  const selectedGoal = taxonomy.goals.find(g => g.id === form.relationship_goal_id);

  return (
    <div>
      <PageHeader title={isEditing ? "Edit Communication Plan" : "New Communication Plan"} />

      {/* Calm journey indicator — relationship setup should feel guided, not technical */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-card/90 border border-border/60 rounded-2xl p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Building the relationship</p>
              <p className="text-sm font-semibold mt-0.5">{steps[step]}</p>
            </div>
            <span className="text-xs text-muted-foreground">{step + 1} of {steps.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />)}
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {campaignLimit !== null && (
          <div className="mb-4 p-4 rounded-xl bg-warning/10 border border-warning/30">
            <p className="text-sm font-medium text-warning mb-1">Routine limit reached</p>
            <p className="text-xs text-muted-foreground">You have reached the number of Communication Plans currently available on this account.</p>
          </div>
        )}

        {/* Step 0 - Relationship */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold mb-1">What kind of relationship is this?</h2>
              <p className="text-sm text-muted-foreground">Choose the category that best fits.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {taxonomy.categories.map((cat, index) => (
                <button
                  key={cat.id}
                  onClick={() => onPickCategory(cat)}
                  className={`flex items-center gap-2.5 p-3.5 rounded-2xl border text-left transition-all text-sm ${
                    form.relationship_category_id === cat.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 bg-card/90 hover:border-primary/30"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${form.relationship_category_id === cat.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium text-xs leading-tight">{cat.display_name}</span>
                </button>
              ))}
            </div>
            {form.relationship_category_id && (
              <div className="space-y-2">
                <Label>Who is this relationship with?</Label>
                <Select value={form.relationship_type_id} onValueChange={v => update("relationship_type_id", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {taxonomy.types.map(ty => (
                      <SelectItem key={ty.id} value={ty.id}>{ty.display_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Step 1 - People */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold mb-1">Who is this routine for?</h2>
              <p className="text-sm text-muted-foreground">Select from your contacts or add someone new.</p>
            </div>

            {/* Import from Phone — always visible (RC18.2.1); DeviceContactPicker handles unsupported platforms */}
            <button
              onClick={() => setShowImport(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors touch-manipulation"
            >
              <Smartphone className="w-4 h-4" /> Import from Phone
            </button>
            {contacts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Your contacts</Label>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {contacts.slice(0, 30).map(c => {
                    const selected = form.recipients.some(r => r.name === (c.display_name || c.first_name));
                    return (
                      <button
                        key={c.id}
                        onClick={() => selectContact(c)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                          selected ? "border-primary bg-accent" : "border-border/60 bg-card"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? "border-primary bg-primary" : "border-border"}`}>
                          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.display_name || c.first_name}</p>
                          {c.phone_number && <p className="text-xs text-muted-foreground">{c.phone_number}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual recipients */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Recipients</Label>
                <button onClick={addRecipient} className="text-xs text-primary font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {form.recipients.map((r, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Input placeholder="Name" value={r.name} onChange={e => updateRecipient(i, "name", e.target.value)} className="h-10 flex-1" />
                    <Input placeholder="Phone (optional)" value={r.phone} onChange={e => updateRecipient(i, "phone", e.target.value)} className="h-10 flex-1" />
                    {form.recipients.length > 1 && (
                      <button onClick={() => removeRecipient(i)} className="p-2 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 - Direction (State + Goal) */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold mb-1">How would you describe the relationship today?</h2>
              <p className="text-sm text-muted-foreground">This helps BoriSend prepare appropriate messages.</p>
            </div>
            <div className="space-y-2">
              {taxonomy.states.map(s => (
                <button
                  key={s.id}
                  onClick={() => update("relationship_state_id", s.id)}
                  className={`w-full p-3.5 rounded-xl border text-left transition-all ${
                    form.relationship_state_id === s.id ? "border-primary bg-accent" : "border-border/60 bg-card hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-semibold capitalize">{s.display_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stateDescriptions[s.system_key] || s.description || ""}</p>
                </button>
              ))}
            </div>

            {form.relationship_state_id && (
              <div className="space-y-2">
                <Label>What would you like to achieve?</Label>
                {eligibleGoalIds === null ? (
                  <Select value={form.relationship_goal_id} onValueChange={v => update("relationship_goal_id", v)}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select goal" /></SelectTrigger>
                    <SelectContent>
                      {taxonomy.goals.map(g => <SelectItem key={g.id} value={g.id}>{g.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : eligibleGoalIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No specific goals recommended for this relationship type.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {taxonomy.goals.filter(g => eligibleGoalIds.includes(g.id)).map(g => (
                      <button
                        key={g.id}
                        onClick={() => update("relationship_goal_id", g.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                          form.relationship_goal_id === g.id ? "border-primary bg-accent" : "border-border/60 bg-card hover:border-primary/30"
                        }`}
                      >
                        <p className="text-sm font-medium">{g.display_name}</p>
                        {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Safety/boundary question */}
            {showSafety && form.relationship_goal_id && (
              <div className="p-4 rounded-xl bg-warning/10 border border-warning/30">
                <div className="flex items-start gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">Has this person asked you not to contact them?</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSafetyConfirmed(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border ${!safetyConfirmed ? "border-primary bg-accent" : "border-border"}`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setSafetyConfirmed(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border ${safetyConfirmed ? "border-primary bg-accent" : "border-border"}`}
                  >
                    No, it's okay to reach out
                  </button>
                </div>
                {!safetyConfirmed && (
                  <p className="text-xs text-muted-foreground mt-3">
                    BoriSend won't prepare reconnection messages when someone has asked for space. Consider respecting their request, or reach out personally when the time feels right.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3 - Context (relationship questions) */}
        {step === 3 && (
          <RelationshipQuestions
            categoryKey={form.relationship_category_system_key}
            answers={contextAnswers}
            onAnswersChange={setContextAnswers}
          />
        )}

        {/* Step 4 - Approach (trigger + mode + rhythm) */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold mb-1">How should messages be prepared?</h2>
              <p className="text-sm text-muted-foreground">Choose how BoriSend prepares messages for this routine.</p>
            </div>

            {/* Trigger Type Selector */}
            <div className="space-y-2">
              <Label>When should BoriSend prepare this communication?</Label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { value: "scheduled", label: "On a schedule", desc: "Daily, weekly, monthly or selected weekdays", icon: CalendarClock },
                  { value: "important_date", label: "Before an important date", desc: "Birthday, anniversary, milestone — from relationship memory", icon: Heart },
                  { value: "one_time_datetime", label: "One-time date & time", desc: "A single future communication (e.g. 4 September at 8:00 AM)", icon: CalendarClock },
                  { value: "manual_event", label: "Manual event", desc: "You trigger it when something happens (e.g. arrived safely)", icon: Users },
                  ...(!packagedMobile ? [
                    { value: "location_arrival", label: "When I arrive at a place", desc: "Use a location event, with a manual trigger available on web", icon: Smartphone },
                    { value: "location_departure", label: "When I leave a place", desc: "Use a location event, with a manual trigger available on web", icon: Smartphone },
                  ] : []),
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => update("trigger_type", opt.value)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                        form.trigger_type === opt.value ? "border-primary bg-accent" : "border-border/60 bg-card hover:border-primary/30"
                      }`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trigger-specific configuration */}
            {form.trigger_type === "one_time_datetime" && (
              <div className="space-y-2 p-4 rounded-xl bg-muted/40 border border-border/40">
                <Label>Date & time</Label>
                <Input
                  type="datetime-local"
                  value={form.trigger_config.one_time_datetime || ""}
                  onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, one_time_datetime: e.target.value } }))}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">BoriSend will prepare one message for this specific date and time. It will not recur.</p>
              </div>
            )}

            {form.trigger_type === "manual_event" && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/40">
                <div className="space-y-2">
                  <Label>Event label</Label>
                  <Input
                    placeholder="e.g. Arrived safely"
                    value={form.trigger_config.manual_event_label || ""}
                    onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, manual_event_label: e.target.value } }))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Communication intention</Label>
                  <Textarea
                    placeholder="e.g. Let my spouse know I arrived safely."
                    value={form.trigger_config.trigger_intent || ""}
                    onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, trigger_intent: e.target.value } }))}
                    rows={2}
                  />
                </div>
                <p className="text-xs text-muted-foreground">You'll be able to trigger this from the routine page whenever the event occurs.</p>
              </div>
            )}

            {(form.trigger_type === "location_arrival" || form.trigger_type === "location_departure") && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/40">
                <div className="space-y-2">
                  <Label>Place name</Label>
                  <Input
                    placeholder="e.g. Work, Home, Gym"
                    value={form.trigger_config.location_place_name || ""}
                    onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, location_place_name: e.target.value } }))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Communication intention</Label>
                  <Textarea
                    placeholder="e.g. Let my team know I'm on my way."
                    value={form.trigger_config.trigger_intent || ""}
                    onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, trigger_intent: e.target.value } }))}
                    rows={2}
                  />
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/20">
                  <AlertCircle className="w-4 h-4 text-info shrink-0 mt-0.5" />
                  <p className="text-xs text-info-foreground">
                    Automatic location detection is not enabled in the current store build. On web, you can still use this routine as a manual location-event trigger from the routine page.
                  </p>
                </div>
              </div>
            )}

            {form.trigger_type === "important_date" && (
              <div className="p-4 rounded-xl bg-muted/40 border border-border/40">
                <p className="text-sm text-muted-foreground">
                  BoriSend will prepare messages before important dates you've saved for this relationship (birthdays, anniversaries, milestones). Configure important dates from each contact's relationship memory after creating this routine.
                </p>
              </div>
            )}

            {/* Mode - only show if multiple recipients */}
            {form.recipients.filter(r => r.name.trim()).length > 1 ? (
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => update("message_mode", "personalised")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    form.message_mode === "personalised" ? "border-primary bg-accent" : "border-border/60 bg-card"
                  }`}
                >
                  <User className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{t("personalForEach")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("personalForEachDesc")}</p>
                  </div>
                </button>
                <button
                  onClick={() => update("message_mode", "shared")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    form.message_mode === "shared" ? "border-primary bg-accent" : "border-border/60 bg-card"
                  }`}
                >
                  <Users className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{t("sameForEveryone")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("sameForEveryoneDesc")}</p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-muted/50 border border-border/40 text-sm text-muted-foreground">
                Messages will be personalised for this person.
              </div>
            )}

            {/* Rhythm recommendation — only for scheduled trigger */}
            {form.trigger_type === "scheduled" && rhythmRec && (
              <div className="p-4 rounded-xl bg-card border border-border/60">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold">{t("recommendedRhythm")}</p>
                </div>
                <p className="text-sm mb-1">
                  {rhythmRec.recommended_frequency?.label || `${rhythmRec.recommended_frequency?.max_per_week} time(s) per week`}
                </p>
                {rhythmRec.reasoning && <p className="text-xs text-muted-foreground mb-3">{rhythmRec.reasoning}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRhythmMode("recommended"); update("schedule_type", rhythmRec.schedule_type || "weekly"); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${rhythmMode === "recommended" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
                  >
                    {t("useRecommendation")}
                  </button>
                  <button
                    onClick={() => setRhythmMode("custom")}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${rhythmMode === "custom" ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
                  >
                    {t("customise")}
                  </button>
                </div>
                {rhythmMode === "recommended" && (
                  <p className="text-xs text-success mt-2 flex items-center gap-1"><Check className="w-3 h-3" /> Recommended rhythm applied</p>
                )}
              </div>
            )}

            {/* Custom rhythm controls — shown for scheduled trigger when user customises or no recommendation */}
            {form.trigger_type === "scheduled" && (rhythmMode === "custom" || !rhythmRec) && (
              <div className="space-y-3">
                <Label>{t("communicationRhythm")}</Label>
                <Select value={form.schedule_type} onValueChange={v => update("schedule_type", v)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {scheduleTypes.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(form.schedule_type === "specific_daily" || form.schedule_type === "weekly" || form.schedule_type === "monthly") && (
                  <Input type="time" value={form.schedule_time} onChange={e => update("schedule_time", e.target.value)} className="h-11" />
                )}
                {form.schedule_type === "selected_weekdays" && (
                  <div className="flex gap-1.5">
                    {weekdays.map((d, i) => (
                      <button
                        key={d} onClick={() => toggleDay(i)}
                        className={`w-10 h-10 rounded-xl text-xs font-medium transition-all ${
                          form.schedule_days.includes(i) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 5 - Style + Context */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold mb-1">Message style</h2>
              <p className="text-sm text-muted-foreground">{t("messagePreferences")}</p>
            </div>

            <div>
              <Label className="mb-2 block">Tone</Label>
              <div className="flex flex-wrap gap-1.5">
                {tones.map(tone => (
                  <button
                    key={tone} onClick={() => update("tone", tone)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize ${
                      form.tone === tone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Message length</Label>
              <div className="flex gap-2">
                {["short", "medium", "long"].map(l => (
                  <button
                    key={l} onClick={() => update("message_length", l)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium capitalize transition-all ${
                      form.message_length === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Message language</Label>
              <Select value={form.message_language} onValueChange={v => update("message_language", v)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="use_default">Use my default</SelectItem>
                  {messageLanguages.map(l => (
                    <SelectItem key={l.system_key} value={l.system_key}>
                      {l.native_name}{l.native_name !== l.display_name ? ` (${l.display_name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">What language should BoriSend use for messages in this routine? Individual recipients can override this.</p>
            </div>

            <div className="space-y-2">
              <Label>{t("relationshipContext")} (optional)</Label>
              <Textarea
                placeholder="Add anything that could help BoriSend prepare more thoughtful messages — interests, important circumstances, milestones, communication preferences..."
                value={form.additional_instructions}
                onChange={e => update("additional_instructions", e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Routine name</Label>
              <Input
                placeholder="e.g. Staying close with Sarah"
                value={form.name}
                onChange={e => update("name", e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Pet name (optional)</Label>
              <Input
                placeholder="e.g. My Love, Honey, Sweetheart..."
                value={form.pet_name}
                onChange={e => update("pet_name", e.target.value)}
                className="h-11"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/50">
              <div>
                <p className="text-sm font-medium">Manual approval</p>
                <p className="text-xs text-muted-foreground mt-0.5">Review each message before it's sent</p>
              </div>
              <Switch
                checked={form.approval_mode === "manual"}
                onCheckedChange={v => update("approval_mode", v ? "manual" : "automatic")}
              />
            </div>
          </div>
        )}

        {/* Step 6 - Review */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-heading font-semibold mb-1">Review your routine</h2>
              <p className="text-sm text-muted-foreground">Check the details before creating.</p>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-3">
              <ReviewRow label="Routine name" value={form.name || "Untitled routine"} />
              <ReviewRow label="Relationship" value={selectedType?.display_label || taxonomy.categories.find(c => c.id === form.relationship_category_id)?.display_name || "—"} />
              <ReviewRow label="People" value={`${form.recipients.filter(r => r.name.trim()).length} selected`} />
              <ReviewRow label="Current state" value={selectedState?.display_name || "—"} />
              <ReviewRow label="Goal" value={selectedGoal?.display_name || "—"} />
              <ReviewRow label="Approach" value={form.message_mode === "shared" ? "Same for everyone" : "Personalised"} />
              <ReviewRow label="Trigger" value={(() => {
                const labels = {
                  scheduled: "On a schedule",
                  important_date: "Before important dates",
                  one_time_datetime: "One-time date & time",
                  manual_event: "Manual event",
                  location_arrival: "When I arrive at a place",
                  location_departure: "When I leave a place",
                };
                return labels[form.trigger_type] || form.trigger_type;
              })()} />
              <ReviewRow label="Language" value={form.message_language === "use_default" ? "My default" : (messageLanguages.find(l => l.system_key === form.message_language)?.display_name || "Default")} />
              {form.trigger_type === "scheduled" && (
                <ReviewRow label="Rhythm" value={scheduleTypes.find(s => s.value === form.schedule_type)?.label || form.schedule_type} />
              )}
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full h-12 rounded-xl">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Heart className="w-4 h-4 mr-2" />}
              {isEditing ? t("saveChanges") : t("createCommunicationPlan")}
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8 pb-4">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1 h-12 rounded-xl">Back</Button>
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="flex-1 h-12 rounded-xl">
              Continue
            </Button>
          ) : null}
        </div>
      </div>

      {showImport && (
        <DeviceContactPicker
          onClose={() => setShowImport(false)}
          onImported={() => reloadContacts()}
        />
      )}
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}