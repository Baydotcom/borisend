import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import {
  Loader2, Plus, Trash2, Pencil, Calendar, Heart, Star,
  Settings2, Shield, X, Users, Clock
} from "lucide-react";
import { memoryService } from "@/services/relationships/memoryService";

const MEMORY_TYPES = [
  { value: "fact", label: "Things to remember", icon: Heart },
  { value: "important_date", label: "Important dates", icon: Calendar },
  { value: "preference", label: "Preferences", icon: Settings2 },
  { value: "milestone", label: "Milestones", icon: Star },
  { value: "boundary", label: "Boundaries", icon: Shield },
  { value: "shared_activity", label: "Things we enjoy together", icon: Users },
  { value: "current_context", label: "Current circumstances", icon: Clock },
];

const typeColor = {
  fact: "text-primary",
  important_date: "text-info",
  preference: "text-success",
  milestone: "text-warning",
  boundary: "text-destructive",
};

export default function MemoryManager({ planRecipientId, recipientName }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    memory_type: "fact",
    content: "",
    related_date: "",
    is_recurring_annual: false,
    is_trigger_active: false,
    trigger_timing: "on_date",
    trigger_intent: "",
  });

  useEffect(() => {
    if (!planRecipientId) return;
    const load = async () => {
      try {
        const m = await memoryService.listForRecipient(planRecipientId);
        setMemories(m.filter(x => x.is_active !== false));
      } catch (e) {
        console.error("Memory load failed:", e);
      }
      setLoading(false);
    };
    load();
  }, [planRecipientId]);

  const handleSubmit = async () => {
    if (!form.content.trim()) {
      toast({ title: "Please enter some content", variant: "destructive" });
      return;
    }
    try {
      const isDateType = form.memory_type === "important_date" || form.memory_type === "milestone";
      const payload = {
        plan_recipient_id: planRecipientId,
        memory_type: form.memory_type,
        content: form.content.trim(),
        related_date: form.related_date || undefined,
        is_recurring_annual: isDateType ? form.is_recurring_annual : false,
        is_trigger_active: isDateType ? form.is_trigger_active : false,
        trigger_timing: isDateType && form.is_trigger_active ? form.trigger_timing : undefined,
        trigger_intent: isDateType && form.is_trigger_active ? form.trigger_intent.trim() || undefined : undefined,
      };

      if (editingId) {
        await memoryService.updateMemory(editingId, payload);
        setMemories(ms => ms.map(m => m.id === editingId ? { ...m, ...payload } : m));
        toast({ title: "Memory updated" });
      } else {
        const created = await memoryService.addMemory({
          ...payload,
          owner_user_id: (await base44.auth.me()).id,
        });
        setMemories(ms => [created, ...ms]);
        toast({ title: "Memory added" });
      }

      setForm({ memory_type: "fact", content: "", related_date: "", is_recurring_annual: false, is_trigger_active: false, trigger_timing: "on_date", trigger_intent: "" });
          setShowForm(false);
          setEditingId(null);
        } catch (e) {
      toast({ title: "Could not save memory", description: e.message, variant: "destructive" });
    }
  };

  const handleEdit = (m) => {
    setEditingId(m.id);
    setForm({
      memory_type: m.memory_type,
      content: m.content,
      related_date: m.related_date || "",
      is_recurring_annual: m.is_recurring_annual || false,
      is_trigger_active: m.is_trigger_active || false,
      trigger_timing: m.trigger_timing || "on_date",
      trigger_intent: m.trigger_intent || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (m) => {
    if (!confirm("Delete this memory?")) return;
    try {
      await memoryService.deleteMemory(m.id);
      setMemories(ms => ms.filter(x => x.id !== m.id));
      toast({ title: "Memory deleted" });
    } catch (e) {
      toast({ title: "Could not delete", description: e.message, variant: "destructive" });
    }
  };

  const grouped = MEMORY_TYPES.map(mt => ({
    ...mt,
    items: memories.filter(m => m.memory_type === mt.value),
  }));

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Relationship Memory</h3>
          <p className="text-xs text-muted-foreground">
            Help BoriSend remember what matters about {recipientName || "this person"}.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => { setEditingId(null); setForm({ memory_type: "fact", content: "", related_date: "" }); setShowForm(true); }} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-card border border-border/50 rounded-2xl p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{editingId ? "Edit memory" : "Add memory"}</h4>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.memory_type} onValueChange={v => setForm(s => ({ ...s, memory_type: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEMORY_TYPES.map(mt => (
                  <SelectItem key={mt.value} value={mt.value}>
                    <span className="flex items-center gap-2">
                      <mt.icon className="w-3.5 h-3.5" /> {mt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea
              value={form.content}
              onChange={e => setForm(s => ({ ...s, content: e.target.value }))}
              rows={3}
              placeholder="What should BoriSend remember?"
            />
          </div>

          {(form.memory_type === "important_date" || form.memory_type === "milestone") && (
            <>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.related_date}
                  onChange={e => setForm(s => ({ ...s, related_date: e.target.value }))}
                  className="h-10"
                />
              </div>

              {form.related_date && (
                <div className="space-y-3 p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Recurring annually</p>
                      <p className="text-xs text-muted-foreground">Birthdays, anniversaries — repeats each year</p>
                    </div>
                    <Switch
                      checked={form.is_recurring_annual}
                      onCheckedChange={v => setForm(s => ({ ...s, is_recurring_annual: v }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Activate as trigger</p>
                      <p className="text-xs text-muted-foreground">Let BoriSend prepare a message for this date</p>
                    </div>
                    <Switch
                      checked={form.is_trigger_active}
                      onCheckedChange={v => setForm(s => ({ ...s, is_trigger_active: v }))}
                    />
                  </div>

                  {form.is_trigger_active && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Timing</Label>
                        <Select value={form.trigger_timing} onValueChange={v => setForm(s => ({ ...s, trigger_timing: v }))}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="on_date">On the date</SelectItem>
                            <SelectItem value="1_day_before">1 day before</SelectItem>
                            <SelectItem value="3_days_before">3 days before</SelectItem>
                            <SelectItem value="1_week_before">1 week before</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Communication intention</Label>
                        <Input
                          placeholder="e.g. Wish them happy birthday, Celebrate our anniversary..."
                          value={form.trigger_intent}
                          onChange={e => setForm(s => ({ ...s, trigger_intent: e.target.value }))}
                          className="h-10"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} className="flex-1 h-10 rounded-xl text-sm">Save memory</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }} className="h-10 rounded-xl text-sm">Cancel</Button>
          </div>
        </div>
      )}

      {memories.length === 0 && !showForm ? (
        <div className="text-center py-6 bg-muted/30 border border-border/40 rounded-2xl">
          <Heart className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No memories saved yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add things BoriSend should remember to make messages more personal.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => group.items.length > 0 && (
            <div key={group.value}>
              <div className="flex items-center gap-1.5 mb-2">
                <group.icon className={`w-3.5 h-3.5 ${typeColor[group.value]}`} />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</h4>
              </div>
              <div className="space-y-2">
                {group.items.map(m => (
                  <div key={m.id} className="bg-card border border-border/50 rounded-xl p-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/90">{m.content}</p>
                        {m.related_date && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {new Date(m.related_date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                            {m.is_recurring_annual && <span className="text-[10px] text-muted-foreground/60">· annual</span>}
                          </p>
                        )}
                        {m.is_trigger_active && (
                          <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            <Clock className="w-2.5 h-2.5" /> Trigger active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEdit(m)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all">
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(m)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-destructive/10 active:scale-90 transition-all">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}