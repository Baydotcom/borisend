import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import { Loader2, Plus, Trash2, Edit3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ManageAnnouncements() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", type: "info", is_active: true });

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      if (me.role !== "admin" && me.role !== "super_admin") { navigate("/"); return; }
      const a = await base44.entities.Announcement.list("-created_date", 50);
      setItems(a);
      setLoading(false);
    };
    load();
  }, [navigate]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", body: "", type: "info", is_active: true });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ title: item.title, body: item.body, type: item.type, is_active: item.is_active });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (editing) {
      await base44.entities.Announcement.update(editing.id, form);
      setItems(is => is.map(i => i.id === editing.id ? { ...i, ...form } : i));
      toast({ title: "Announcement updated" });
    } else {
      const created = await base44.entities.Announcement.create(form);
      setItems(is => [created, ...is]);
      toast({ title: "Announcement created" });
    }
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.Announcement.delete(id);
    setItems(is => is.filter(i => i.id !== id));
    toast({ title: "Announcement deleted" });
  };

  if (loading) {
    return <PageLoader />;
  }

  const typeStyles = { info: "bg-blue-50 text-blue-700", warning: "bg-amber-50 text-amber-700", promo: "bg-primary/10 text-primary", update: "bg-emerald-50 text-emerald-700" };

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Announcements"
        rightAction={
          <Button size="sm" onClick={openNew} className="h-8 bg-primary hover:bg-primary/90 rounded-lg text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" /> New
          </Button>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
        {items.map(item => (
          <div key={item.id} className={`rounded-xl p-4 border border-border/50 ${item.is_active ? "bg-card" : "bg-muted/30 opacity-60"}`}>
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeStyles[item.type] || ""}`}>{item.type}</span>
                <h4 className="font-medium text-sm">{item.title}</h4>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-muted rounded-lg"><Edit3 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
          </div>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit announcement" : "New announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["info", "warning", "promo", "update"].map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
            <Button onClick={handleSave} className="w-full h-10 bg-primary hover:bg-primary/90">
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}