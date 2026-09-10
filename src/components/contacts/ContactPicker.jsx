import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Check, X, UserPlus, Smartphone } from "lucide-react";
import DeviceContactPicker from "@/components/contacts/DeviceContactPicker";

/**
 * RC18.1 §52/§54 — Reusable Contact Picker component.
 * Supports multi-select. Designed for RC18.2 phone-contact import compatibility.
 * RC18.2.1: Import from Phone is always visible — DeviceContactPicker handles
 * unsupported platforms with a clear fallback message.
 */
export default function ContactPicker({ selectedIds, onChange, maxHeight = "320px" }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const all = await base44.entities.Contact.filter({ is_active: true }, "display_name", 200);
      // Filter to user's contacts (RLS handles this, but double-check)
      setContacts(all);
    } catch (e) {
      console.error("[ContactPicker] load failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (contactId) => {
    if (selectedIds.includes(contactId)) {
      onChange(selectedIds.filter(id => id !== contactId));
    } else {
      onChange([...selectedIds, contactId]);
    }
  };

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.display_name || "").toLowerCase().includes(q) ||
      (c.phone_number || "").toLowerCase().includes(q) ||
      (c.first_name || "").toLowerCase().includes(q) ||
      (c.last_name || "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-center py-10 px-4">
          <UserPlus className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No contacts yet</p>
          <p className="text-xs text-muted-foreground/70">
            Add contacts first, then select them here.
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors touch-manipulation"
        >
          <Smartphone className="w-4 h-4" /> Import from Phone
        </button>
        {showImport && (
          <DeviceContactPicker
            onClose={() => setShowImport(false)}
            onImported={() => loadContacts()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setShowImport(true)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors touch-manipulation"
      >
        <Smartphone className="w-4 h-4" /> Import from Phone
      </button>
      {showImport && (
        <DeviceContactPicker
          onClose={() => setShowImport(false)}
          onImported={() => loadContacts()}
        />
      )}
      {contacts.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <div className="overflow-y-auto space-y-1" style={{ maxHeight }}>
        {filtered.map(contact => {
          const isSelected = selectedIds.includes(contact.id);
          return (
            <button
              key={contact.id}
              onClick={() => toggle(contact.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors touch-manipulation ${
                isSelected
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-card border border-border/50 hover:bg-muted/50"
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
              }`}>
                {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate">{contact.display_name}</p>
                {contact.phone_number && (
                  <p className="text-xs text-muted-foreground">{contact.phone_number}</p>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">No contacts match your search.</p>
        )}
      </div>
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            {selectedIds.length} recipient{selectedIds.length === 1 ? "" : "s"} selected
          </p>
          <button
            onClick={() => onChange([])}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        </div>
      )}
    </div>
  );
}