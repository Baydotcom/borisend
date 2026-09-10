import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, Mail, Users, ChevronRight, Plus, CalendarClock, Pencil, X, Trash2, Globe } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import MemoryManager from "@/components/memory/MemoryManager";
import DeleteContactDialog from "@/components/contacts/DeleteContactDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

export default function ContactDetail() {
  const { id } = useParams();
  const [contact, setContact] = useState(null);
  const [plans, setPlans] = useState([]);
  const [planRecipients, setPlanRecipients] = useState([]);
  const [types, setTypes] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [messageLanguages, setMessageLanguages] = useState([]);
  const [langSaving, setLangSaving] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const c = await base44.entities.Contact.get(id);
        setContact(c);
        setEditForm({
          first_name: c?.first_name || "",
          last_name: c?.last_name || "",
          phone_number: c?.phone_number || "",
          email: c?.email || "",
          notes: c?.notes || "",
        });
        const [allPlans, recips, relTypes, relGoals, langs] = await Promise.all([
          base44.entities.Campaign.list("-created_date", 100),
          base44.entities.PlanRecipient.filter({ contact_id: id }),
          base44.entities.RelationshipType.list("display_order", 100).catch(() => []),
          base44.entities.RelationshipGoal.list("display_order", 50).catch(() => []),
          base44.entities.MessageLanguage.filter({ is_active: true }, "display_order", 100).catch(() => []),
        ]);
        // Match plans via PlanRecipient (authoritative) OR legacy recipients array
        const prCampaignIds = new Set(recips.map(pr => pr.campaign_id));
        const matched = allPlans.filter(p =>
          p.status !== "archived" && (
            prCampaignIds.has(p.id) ||
            (p.recipients || []).some(r =>
              r.name === c.display_name || r.name === `${c.first_name} ${c.last_name}`.trim() ||
              (c.phone_number && r.phone === c.phone_number)
            )
          )
        );
        setPlans(matched);
        setPlanRecipients(recips);
        setTypes(relTypes);
        setGoals(relGoals);
        setMessageLanguages(langs || []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleLanguageOverride = async (prId, langCode) => {
    setLangSaving(prId);
    try {
      await base44.entities.PlanRecipient.update(prId, {
        message_language_override: langCode || null,
      });
      setPlanRecipients(prs => prs.map(pr => pr.id === prId ? { ...pr, message_language_override: langCode || null } : pr));
      toast({ title: langCode ? "Language override saved" : "Using routine language" });
    } catch (e) {
      toast({ title: "Could not save language", description: e.message, variant: "destructive" });
    }
    setLangSaving(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const displayName = [editForm.first_name, editForm.last_name].filter(Boolean).join(" ") || editForm.first_name;
      await base44.entities.Contact.update(contact.id, {
        ...editForm,
        display_name: displayName,
      });
      setContact({ ...contact, ...editForm, display_name: displayName });
      toast({ title: "Contact updated" });
      setEditing(false);
    } catch (e) {
      toast({ title: "Could not update contact", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!contact) {
    return (
      <div>
        <PageHeader title="Contact" />
        <div className="text-center py-12 text-sm text-muted-foreground">Contact not found.</div>
      </div>
    );
  }

  const typeMap = new Map(types.map(t => [t.id, t]));
  const goalMap = new Map(goals.map(g => [g.id, g]));
  const planMap = new Map(plans.map(p => [p.id, p]));

  return (
    <div>
      <PageHeader
        title={contact.display_name || contact.first_name}
        showHome
        rightAction={
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit contact"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all touch-manipulation"
          >
            <Pencil className="w-4 h-4" />
          </button>
        }
      />

      <div className="px-4 py-4 w-full max-w-3xl mx-auto">
        {/* Person card */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center ring-4 ring-primary/10 shadow-sm">
              <span className="text-xl font-bold">
                {(contact.display_name || contact.first_name || "?").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary mb-0.5">Person</p>
              <h2 className="text-xl font-heading font-semibold truncate">{contact.display_name || contact.first_name}</h2>
              {contact.organisation && <p className="text-xs text-muted-foreground">{contact.organisation}</p>}
            </div>
          </div>
          <div className="space-y-2">
            {contact.phone_number && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{contact.phone_number}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.timezone && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                <span>{contact.timezone}</span>
              </div>
            )}
          </div>
          {contact.notes && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground/80">{contact.notes}</p>
            </div>
          )}
          <button
            onClick={() => setDeleting(contact)}
            className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete contact
          </button>
        </div>

        {/* Relationship Memory — grouped by PlanRecipient (relationship instance) */}
        {planRecipients.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Relationship Memory
            </h3>
            {planRecipients.map(pr => {
              const plan = planMap.get(pr.campaign_id);
              const relType = pr.relationship_type_id ? typeMap.get(pr.relationship_type_id) : null;
              const relGoal = pr.relationship_goal_id ? goalMap.get(pr.relationship_goal_id) : null;
              return (
                <div key={pr.id} className="bg-card/90 border border-border/60 rounded-3xl p-4 mb-3 last:mb-0 shadow-sm">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">{plan?.name || "Communication Plan"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {relType && <span className="text-xs text-muted-foreground">{relType.display_label}</span>}
                      {relType && relGoal && <span className="text-xs text-muted-foreground/50">·</span>}
                      {relGoal && <span className="text-xs text-muted-foreground">{relGoal.display_name}</span>}
                    </div>
                    {pr.status !== "active" && (
                      <span className="text-[10px] text-muted-foreground/70 mt-1 inline-block">{pr.status}</span>
                    )}
                  </div>

                  <div className="mb-3 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      <Label className="text-xs font-medium">Message language</Label>
                    </div>
                    <Select
                      value={pr.message_language_override || "inherit"}
                      onValueChange={v => handleLanguageOverride(pr.id, v === "inherit" ? "" : v)}
                      disabled={langSaving === pr.id}
                    >
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">Use routine language</SelectItem>
                        {messageLanguages.map(l => (
                          <SelectItem key={l.system_key} value={l.system_key}>
                            {l.native_name}{l.native_name !== l.display_name ? ` (${l.display_name})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <MemoryManager planRecipientId={pr.id} recipientName={contact.display_name || contact.first_name} />
                </div>
              );
            })}
          </div>
        )}

        {/* Relationship routines */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Communication Plans
          </h3>
          {plans.length === 0 ? (
            <div className="text-center py-8 bg-card border border-border/60 rounded-2xl">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Not part of any routines yet</p>
              <Link to="/campaigns/new" className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                <Plus className="w-3 h-3" /> Create a routine
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {plans.map((p) => (
                <Link
                  key={p.id}
                  to={`/campaigns/${p.id}`}
                  className="flex items-center justify-between bg-card/90 border border-border/60 rounded-2xl p-3.5 shadow-sm active:scale-[0.99] transition-transform"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.name || "Communication Plan"}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.recipients?.length || 0} {p.recipients?.length === 1 ? "person" : "people"} · {p.status}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Edit Contact Sheet */}
      {editing && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={() => setEditing(false)}>
          <div className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto nav-safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold">Edit contact</h2>
              <button onClick={() => setEditing(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">First name</Label>
                  <Input value={editForm.first_name} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Last name</Label>
                  <Input value={editForm.last_name} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone number</Label>
                <Input value={editForm.phone_number} onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="h-10" />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full h-11 rounded-xl mt-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <DeleteContactDialog
          contact={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => setDeleting(null)}
        />
      )}
    </div>
  );
}