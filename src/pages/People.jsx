import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import InlineLoader from "@/components/loaders/InlineLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Search, Users, Phone, Mail, ChevronRight, X, Pencil, Trash2, AlertTriangle, Smartphone } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/common/PullToRefreshIndicator";
import { toast } from "@/components/ui/use-toast";
import { useI18n } from "@/lib/I18nContext";
import DeleteContactDialog from "@/components/contacts/DeleteContactDialog";
import DeviceContactPicker from "@/components/contacts/DeviceContactPicker";

export default function People() {
  const { t } = useI18n();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [newContact, setNewContact] = useState({ first_name: "", last_name: "", phone_number: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await base44.entities.Contact.list("-created_date", 200);
      setContacts(c);
    } catch (e) {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.Contact.subscribe(() => load());
    return () => unsubscribe();
  }, [load]);

  useRefreshOnFocus(load);
  const { pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(load);

  const handleSave = async () => {
    const trimmed = newContact.first_name.trim();
    if (!trimmed) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const displayName = [newContact.first_name, newContact.last_name].filter(Boolean).join(" ") || newContact.first_name;
      if (editing) {
        await base44.entities.Contact.update(editing.id, {
          first_name: newContact.first_name,
          last_name: newContact.last_name,
          phone_number: newContact.phone_number,
          email: newContact.email,
          notes: newContact.notes,
          display_name: displayName,
        });
        toast({ title: "Contact updated" });
      } else {
        await base44.entities.Contact.create({
          ...newContact,
          display_name: displayName,
        });
        toast({ title: "Contact added" });
      }
      setNewContact({ first_name: "", last_name: "", phone_number: "", email: "", notes: "" });
      setShowAdd(false);
      setEditing(null);
      load();
    } catch (e) {
      toast({ title: editing ? "Could not update contact" : "Could not add contact", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (contact) => {
    setEditing(contact);
    setNewContact({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      phone_number: contact.phone_number || "",
      email: contact.email || "",
      notes: contact.notes || "",
    });
    setShowAdd(true);
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditing(null);
    setNewContact({ first_name: "", last_name: "", phone_number: "", email: "", notes: "" });
  };

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.display_name || "").toLowerCase().includes(q) ||
           (c.phone_number || "").includes(q) ||
           (c.email || "").toLowerCase().includes(q);
  });

  return (
    <div>
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />
      <PageHeader
        title={t("navPeople")}
        onBack={false}
        rightAction={
          <Button size="sm" onClick={() => setShowAddSheet(true)} className="h-8 rounded-lg text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        }
      />

      <div className="px-4 pt-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <InlineLoader />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-card border border-border/60 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">{contacts.length === 0 ? "No contacts yet" : "No results"}</p>
            <p className="text-xs text-muted-foreground mb-4">
              {contacts.length === 0 ? "Add the people you want to stay connected with." : "Try a different search."}
            </p>
            {contacts.length === 0 && (
              <Button size="sm" onClick={() => setShowAddSheet(true)} className="rounded-xl">
                <Plus className="w-4 h-4 mr-1" /> Add contact
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 pb-4">
            <div className="rounded-2xl bg-primary/5 border border-primary/10 p-3.5 mb-4">
              <p className="text-xs font-semibold text-primary">Your people</p>
              <p className="text-xs text-muted-foreground mt-1">Keep the people in your Communication Plans easy to recognise and reach.</p>
            </div>
            {filtered.map((c, index) => (
              <div
                key={c.id}
                className="flex items-center gap-3 bg-card/90 border border-border/60 rounded-2xl p-3.5 group shadow-sm"
              >
                <Link to={`/people/${c.id}`} className="flex items-center gap-3 flex-1 min-w-0 active:scale-[0.99] transition-transform">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ring-2 ring-background ${index % 3 === 0 ? "bg-primary text-primary-foreground" : index % 3 === 1 ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}>
                    <span className="text-sm font-bold">
                      {(c.display_name || c.first_name || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.display_name || c.first_name}</p>
                    {c.phone_number && <p className="text-xs text-muted-foreground">{c.phone_number}</p>}
                  </div>
                </Link>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => openEdit(c)}
                    aria-label="Edit contact"
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setDeleting(c)}
                    aria-label="Delete contact"
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-destructive/10 active:scale-90 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <Link to={`/people/${c.id}`} className="ml-1">
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Contact Sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={closeForm}>
          <div className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto nav-safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold">{editing ? "Edit contact" : "Add contact"}</h2>
              <button onClick={closeForm} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("firstName")}</Label>
                  <Input
                    value={newContact.first_name}
                    onChange={e => setNewContact({ ...newContact, first_name: e.target.value })}
                    className="h-10"
                    placeholder="Sarah"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("lastName")}</Label>
                  <Input
                    value={newContact.last_name}
                    onChange={e => setNewContact({ ...newContact, last_name: e.target.value })}
                    className="h-10"
                    placeholder="Johnson"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone number</Label>
                <Input
                  value={newContact.phone_number}
                  onChange={e => setNewContact({ ...newContact, phone_number: e.target.value })}
                  className="h-10"
                  placeholder="+44 7000 000000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email (optional)</Label>
                <Input
                  value={newContact.email}
                  onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                  className="h-10"
                  placeholder="sarah@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={newContact.notes}
                  onChange={e => setNewContact({ ...newContact, notes: e.target.value })}
                  className="h-10"
                  placeholder="Colleague, loves hiking"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full h-11 rounded-xl mt-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : editing ? <Pencil className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {editing ? "Save changes" : "Add contact"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <DeleteContactDialog
          contact={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); load(); }}
        />
      )}

      {/* Add People action sheet — Add Manually / Import from Phone (RC18.2.1) */}
      {showAddSheet && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowAddSheet(false)}>
          <div className="bg-background w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-4 nav-safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
            <button
              onClick={() => { setShowAddSheet(false); setEditing(null); setNewContact({ first_name: "", last_name: "", phone_number: "", email: "", notes: "" }); setShowAdd(true); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors touch-manipulation"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Add Manually</p>
                <p className="text-xs text-muted-foreground">Enter name and phone number yourself</p>
              </div>
            </button>
            <button
              onClick={() => { setShowAddSheet(false); setShowImport(true); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors touch-manipulation"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Import from Phone</p>
                <p className="text-xs text-muted-foreground">Choose contacts from your device</p>
              </div>
            </button>
            <Button variant="outline" onClick={() => setShowAddSheet(false)} className="w-full mt-2 h-10 rounded-xl">Cancel</Button>
          </div>
        </div>
      )}

      {showImport && (
        <DeviceContactPicker
          onClose={() => setShowImport(false)}
          onImported={() => load()}
        />
      )}
    </div>
  );
}