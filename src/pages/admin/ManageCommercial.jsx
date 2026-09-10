import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import { Loader2, Plus, Pencil, AlertTriangle, ShieldCheck } from "lucide-react";
import { entitlementLabel, ENTITLEMENT_LABELS } from "@/lib/entitlementLabels";
import { useNavigate } from "react-router-dom";

const emptyConfig = { system_key: "borisend_membership", display_name: "", description: "", included_plan_units: 3, included_recipient_units: 10, included_message_units: 20, included_message_passes: 5, included_smart_message_units: 30, monthly_price: null, annual_price: null, monthly_stripe_price_id: "", annual_stripe_price_id: "", currency: "GBP", is_active: true, display_order: 0 };
const emptyProduct = { system_key: "", display_name: "", description: "", entitlement_type: "recipient_units", quantity: 5, billing_mode: "one_period", monthly_price: null, monthly_stripe_price_id: "", supports_annual: false, annual_price: null, annual_stripe_price_id: "", currency: "GBP", is_active: true, display_order: 0 };
const emptyAdjustment = { owner_user_id: "", entitlement_type: "recipient_units", quantity: 5, reason: "", is_permanent: false, expiry_date: "" };

export default function ManageCommercial() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("membership");
  const [configs, setConfigs] = useState([]);
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [editingLang, setEditingLang] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [adjustForm, setAdjustForm] = useState(emptyAdjustment);
  const [saving, setSaving] = useState(false);
  const [verifyingEntitlements, setVerifyingEntitlements] = useState(false);
  const [entitlementReport, setEntitlementReport] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cfgs, prods, adj, langs] = await Promise.all([
        base44.entities.MembershipConfiguration.list("display_order", 50),
        base44.entities.AddOnProduct.list("display_order", 50),
        base44.entities.AdminEntitlementAdjustment.list("-created_date", 50),
        base44.entities.MessageLanguage.list("display_order", 100),
      ]);
      setConfigs(cfgs || []);
      setProducts(prods || []);
      setAdjustments(adj || []);
      setLanguages(langs || []);
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const verifyEntitlements = async () => {
    setVerifyingEntitlements(true);
    try {
      const res = await base44.functions.invoke("adminVerifyEntitlements", {});
      setEntitlementReport(res?.data || res);
      const report = res?.data || res;
      toast({
        title: report?.all_passed ? "Entitlement verification passed" : "Entitlement verification needs attention",
        description: `${report?.passed_users || 0} of ${report?.checked_users || 0} paid/member accounts matched their effective capacity.`,
        variant: report?.all_passed ? "default" : "destructive",
      });
    } catch (e) { toast({ title: "Could not verify entitlements", description: e.message, variant: "destructive" }); }
    finally { setVerifyingEntitlements(false); }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      if (editingConfig.id) await base44.entities.MembershipConfiguration.update(editingConfig.id, editingConfig);
      else await base44.entities.MembershipConfiguration.create(editingConfig);
      toast({ title: "Membership saved" });
      setEditingConfig(null);
      load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const saveProduct = async () => {
    setSaving(true);
    try {
      if (editingProduct.id) await base44.entities.AddOnProduct.update(editingProduct.id, editingProduct);
      else await base44.entities.AddOnProduct.create(editingProduct);
      toast({ title: "Add-on product saved" });
      setEditingProduct(null);
      load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const saveAdjustment = async () => {
    if (!adjustForm.owner_user_id || !adjustForm.reason) { toast({ title: "User ID and reason are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.AdminEntitlementAdjustment.create({
        ...adjustForm,
        quantity: Number(adjustForm.quantity),
        created_by_id: me.id,
        effective_date: new Date().toISOString(),
        expiry_date: adjustForm.is_permanent ? null : (adjustForm.expiry_date ? new Date(adjustForm.expiry_date).toISOString() : null),
      });
      toast({ title: "Adjustment applied" });
      setAdjustForm(emptyAdjustment);
      load();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  if (loading) return <PageLoader />;

  const Tab = ({ id, label }) => (
    <button onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{label}</button>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <AdminPageHeader title="Commercial configuration" />
        <div className="flex gap-2 mb-5">
          <Tab id="membership" label="Membership" />
          <Tab id="addons" label="Add-on products" />
          <Tab id="adjustments" label="Adjustments" />
          <Tab id="languages" label="Languages" />
        </div>

        {tab === "membership" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEditingConfig({ ...emptyConfig })} size="sm" className="bg-primary"><Plus className="w-4 h-4 mr-1" /> New membership config</Button>
              <Button onClick={verifyEntitlements} disabled={verifyingEntitlements} size="sm" variant="outline">
                {verifyingEntitlements ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />} Verify paid entitlements
              </Button>
            </div>
            {entitlementReport && (
              <div className={`rounded-xl border p-3 text-xs ${entitlementReport.all_passed ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                <p className="font-semibold">{entitlementReport.all_passed ? "All checked accounts match effective entitlements." : `${entitlementReport.failed_users} account(s) need entitlement review.`}</p>
                <p className="text-muted-foreground mt-1">Checked {entitlementReport.checked_users} account(s). Membership, add-on quantities and effective Plan, Recipient, Generated Message, Message Pass and Smart Message capacity were compared.</p>
              </div>
            )}
            {configs.map(c => (
              <div key={c.id} className="bg-card border border-border/50 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{c.display_name} {c.is_active && <span className="text-[10px] text-emerald-600 font-medium ml-1">Active</span>}</p>
                    <p className="text-xs text-muted-foreground">{c.included_plan_units} plans · {c.included_recipient_units} recipients · {c.included_message_units ?? 0} gen msgs · {c.included_message_passes ?? 5} passes · {c.included_smart_message_units ?? 30} smart msgs</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Monthly: {c.monthly_stripe_price_id || "—"} · Annual: {c.annual_stripe_price_id || "—"}</p>
                    {(!c.monthly_stripe_price_id || (c.annual_price != null && !c.annual_stripe_price_id)) && (
                      <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Stripe Price ID missing — customer checkout disabled</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingConfig({ ...c })} className="p-2 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}

            {editingConfig && (
              <ConfigForm value={editingConfig} onChange={setEditingConfig} onSave={saveConfig} onCancel={() => setEditingConfig(null)} saving={saving} />
            )}
          </div>
        )}

        {tab === "addons" && (
          <div className="space-y-3">
            <Button onClick={() => setEditingProduct({ ...emptyProduct })} size="sm" className="bg-primary"><Plus className="w-4 h-4 mr-1" /> New add-on product</Button>
            {products.map(p => (
              <div key={p.id} className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">+{p.quantity} {entitlementLabel(p.entitlement_type)} {p.is_active ? "" : "(inactive)"}</p>
                  <p className="text-xs text-muted-foreground">{p.display_name} · £{p.monthly_price ?? "—"}/mo {p.supports_annual ? `· £${p.annual_price ?? "—"}/yr` : ""}</p>
                  <p className="text-[11px] text-muted-foreground">{p.billing_mode === "recurring" ? "Recurring" : "One period"} · Order: {p.display_order}</p>
                  {!p.monthly_stripe_price_id && (
                    <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Stripe Price ID missing</p>
                  )}
                </div>
                <button onClick={() => setEditingProduct({ ...p })} className="p-2 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
              </div>
            ))}
            {editingProduct && (
              <ProductForm value={editingProduct} onChange={setEditingProduct} onSave={saveProduct} onCancel={() => setEditingProduct(null)} saving={saving} />
            )}
          </div>
        )}

        {tab === "adjustments" && (
          <div className="space-y-4">
            <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-semibold">Grant capacity adjustment</h3>
              <div className="space-y-1.5"><Label>User ID</Label><Input value={adjustForm.owner_user_id} onChange={e => setAdjustForm(f => ({ ...f, owner_user_id: e.target.value }))} placeholder="base44 user id" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Type</Label>
                  <Select value={adjustForm.entitlement_type} onValueChange={v => setAdjustForm(f => ({ ...f, entitlement_type: v }))}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="communication_plan_units">Communication Plans</SelectItem>
                      <SelectItem value="recipient_units">Recipients</SelectItem>
                      <SelectItem value="message_units">Generated Messages</SelectItem>
                      <SelectItem value="message_passes">Message Passes</SelectItem>
                      <SelectItem value="smart_message_units">Smart Messages</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" value={adjustForm.quantity} onChange={e => setAdjustForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label>Reason</Label><Input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="support / promotion / service recovery" /></div>
              <div className="flex items-center gap-2"><Switch checked={adjustForm.is_permanent} onCheckedChange={v => setAdjustForm(f => ({ ...f, is_permanent: v }))} /><span className="text-xs">Permanent</span></div>
              {!adjustForm.is_permanent && <div className="space-y-1.5"><Label>Expiry date</Label><Input type="date" value={adjustForm.expiry_date} onChange={e => setAdjustForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>}
              <Button onClick={saveAdjustment} disabled={saving} className="w-full bg-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Apply adjustment</Button>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent adjustments</h4>
              {adjustments.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
              {adjustments.map(a => (
                <div key={a.id} className="bg-card border border-border/50 rounded-xl p-3 text-xs">
                  <p className="font-medium">+{a.quantity} {entitlementLabel(a.entitlement_type)}</p>
                  <p className="text-muted-foreground">{a.reason} · {a.is_permanent ? "permanent" : `expires ${a.expiry_date ? new Date(a.expiry_date).toLocaleDateString() : "—"}`}</p>
                  <p className="text-muted-foreground/70">user {a.owner_user_id?.slice(-6)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "languages" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Generated-message languages. Active languages appear in user selection. Deactivating a language does not destroy existing configuration (§48).</p>
            <Button onClick={() => setEditingLang({ system_key: "", display_name: "", native_name: "", locale_code: "", generation_instruction: "", display_order: 0, is_active: true })} size="sm" className="bg-primary"><Plus className="w-4 h-4 mr-1" /> Add language</Button>
            {languages.map(l => (
              <div key={l.id} className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{l.native_name || l.display_name} {l.is_active ? <span className="text-[10px] text-emerald-600 font-medium ml-1">Active</span> : <span className="text-[10px] text-muted-foreground font-medium ml-1">Inactive</span>}</p>
                  <p className="text-xs text-muted-foreground">{l.display_name} · {l.system_key} · Order: {l.display_order}</p>
                  {l.generation_instruction && <p className="text-[11px] text-muted-foreground mt-1">{l.generation_instruction}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditingLang({ ...l })} className="p-2 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                  <button onClick={async () => { await base44.entities.MessageLanguage.update(l.id, { is_active: !l.is_active }); load(); }} className="p-2 text-muted-foreground hover:text-foreground">
                    <Switch checked={l.is_active} />
                  </button>
                </div>
              </div>
            ))}
            {editingLang && (
              <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
                <div className="space-y-1.5"><Label>System key (code)</Label><Input value={editingLang.system_key} onChange={e => setEditingLang(f => ({ ...f, system_key: e.target.value }))} placeholder="e.g. fr, yo, ar" disabled={!!editingLang.id} /></div>
                <div className="space-y-1.5"><Label>Display name (English)</Label><Input value={editingLang.display_name} onChange={e => setEditingLang(f => ({ ...f, display_name: e.target.value }))} placeholder="e.g. French, Yoruba" /></div>
                <div className="space-y-1.5"><Label>Native name</Label><Input value={editingLang.native_name} onChange={e => setEditingLang(f => ({ ...f, native_name: e.target.value }))} placeholder="e.g. Français, Yorùbá" /></div>
                <div className="space-y-1.5"><Label>Locale code</Label><Input value={editingLang.locale_code} onChange={e => setEditingLang(f => ({ ...f, locale_code: e.target.value }))} placeholder="e.g. fr, yo" /></div>
                <div className="space-y-1.5"><Label>Generation instruction (optional)</Label><Textarea value={editingLang.generation_instruction} onChange={e => setEditingLang(f => ({ ...f, generation_instruction: e.target.value }))} placeholder="e.g. Write in Modern Standard Arabic. Use RTL script." rows={2} /></div>
                <div className="space-y-1.5"><Label>Display order</Label><Input type="number" value={editingLang.display_order} onChange={e => setEditingLang(f => ({ ...f, display_order: Number(e.target.value) }))} /></div>
                <div className="flex gap-2">
                  <Button onClick={async () => { setSaving(true); try { if (editingLang.id) await base44.entities.MessageLanguage.update(editingLang.id, editingLang); else await base44.entities.MessageLanguage.create(editingLang); toast({ title: "Language saved" }); setEditingLang(null); load(); } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); } setSaving(false); }} disabled={saving} className="bg-primary flex-1">{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save</Button>
                  <Button variant="outline" onClick={() => setEditingLang(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={() => navigate("/admin")} className="block text-center text-sm text-primary font-medium mt-6 w-full">← Back to admin</button>
      </div>
    </div>
  );
}

function ConfigForm({ value, onChange, onSave, onCancel, saving }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
      <div className="space-y-1.5"><Label>Display name</Label><Input value={value.display_name} onChange={e => set("display_name", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Description</Label><Textarea value={value.description || ""} onChange={e => set("description", e.target.value)} rows={2} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Included plans</Label><Input type="number" value={value.included_plan_units} onChange={e => set("included_plan_units", Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Included recipients</Label><Input type="number" value={value.included_recipient_units} onChange={e => set("included_recipient_units", Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Included gen. messages</Label><Input type="number" value={value.included_message_units ?? 0} onChange={e => set("included_message_units", Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Included message passes</Label><Input type="number" value={value.included_message_passes ?? 5} onChange={e => set("included_message_passes", Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Included smart messages</Label><Input type="number" value={value.included_smart_message_units ?? 30} onChange={e => set("included_smart_message_units", Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Monthly price (ref)</Label><Input type="number" value={value.monthly_price ?? ""} onChange={e => set("monthly_price", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="space-y-1.5"><Label>Annual price (ref)</Label><Input type="number" value={value.annual_price ?? ""} onChange={e => set("annual_price", e.target.value ? Number(e.target.value) : null)} /></div>
      </div>
      <div className="space-y-1.5"><Label>Monthly Stripe Price ID</Label><Input value={value.monthly_stripe_price_id || ""} onChange={e => set("monthly_stripe_price_id", e.target.value)} placeholder="price_..." /></div>
      <div className="space-y-1.5"><Label>Annual Stripe Price ID</Label><Input value={value.annual_stripe_price_id || ""} onChange={e => set("annual_stripe_price_id", e.target.value)} placeholder="price_..." /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Currency</Label><Input value={value.currency || "GBP"} onChange={e => set("currency", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Display order</Label><Input type="number" value={value.display_order ?? 0} onChange={e => set("display_order", Number(e.target.value))} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={value.is_active} onCheckedChange={v => set("is_active", v)} /><span className="text-xs">Active membership</span></div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving} className="flex-1 bg-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

function ProductForm({ value, onChange, onSave, onCancel, saving }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
      <div className="space-y-1.5"><Label>System key</Label><Input value={value.system_key} onChange={e => set("system_key", e.target.value)} placeholder="recipient_pack_10" disabled={!!value.id} /></div>
      <div className="space-y-1.5"><Label>Display name</Label><Input value={value.display_name} onChange={e => set("display_name", e.target.value)} placeholder="+10 Recipients" /></div>
      <div className="space-y-1.5"><Label>Description</Label><Textarea value={value.description || ""} onChange={e => set("description", e.target.value)} rows={2} placeholder="Add 10 recipient units to your account" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Category</Label>
          <Select value={value.entitlement_type} onValueChange={v => set("entitlement_type", v)}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="communication_plan_units">Communication Plans</SelectItem>
              <SelectItem value="recipient_units">Recipients</SelectItem>
              <SelectItem value="message_units">Generated Messages</SelectItem>
              <SelectItem value="message_passes">Message Passes</SelectItem>
              <SelectItem value="smart_message_units">Smart Messages</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" value={value.quantity} onChange={e => set("quantity", Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Billing mode</Label>
          <Select value={value.billing_mode || "one_period"} onValueChange={v => set("billing_mode", v)}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="one_period">One period (no renewal)</SelectItem>
              <SelectItem value="recurring">Recurring</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Display order</Label><Input type="number" value={value.display_order ?? 0} onChange={e => set("display_order", Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Monthly price (ref)</Label><Input type="number" value={value.monthly_price ?? ""} onChange={e => set("monthly_price", e.target.value ? Number(e.target.value) : null)} /></div>
        <div className="space-y-1.5"><Label>Monthly Stripe Price ID</Label><Input value={value.monthly_stripe_price_id || ""} onChange={e => set("monthly_stripe_price_id", e.target.value)} placeholder="price_..." /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={value.supports_annual} onCheckedChange={v => set("supports_annual", v)} /><span className="text-xs">Supports annual</span></div>
      {value.supports_annual && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Annual price (ref)</Label><Input type="number" value={value.annual_price ?? ""} onChange={e => set("annual_price", e.target.value ? Number(e.target.value) : null)} /></div>
          <div className="space-y-1.5"><Label>Annual Stripe Price ID</Label><Input value={value.annual_stripe_price_id || ""} onChange={e => set("annual_stripe_price_id", e.target.value)} placeholder="price_..." /></div>
        </div>
      )}
      <div className="flex items-center gap-2"><Switch checked={value.is_active} onCheckedChange={v => set("is_active", v)} /><span className="text-xs">Active</span></div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving} className="flex-1 bg-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}