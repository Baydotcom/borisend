import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import PageLoader from "@/components/loaders/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { ImagePlus, Loader2, Pencil, Trash2, Upload, Eye, EyeOff } from "lucide-react";

const blank = {
  title: "",
  body: "",
  image_url: "",
  alt_text: "",
  cta_label: "",
  cta_url: "",
  slide_type: "image",
  placement: "both",
  display_order: 0,
  is_active: true,
  starts_at: "",
  ends_at: "",
};

export default function AdminMedia() {
  const [slides, setSlides] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const rows = await base44.entities.DashboardSlide.list("display_order", 100);
      setSlides(rows || []);
    } catch (e) {
      toast({ title: "Could not load media", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reset = () => { setForm(blank); setEditingId(null); };

  const uploadImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Choose an image file", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Image is too large", description: "Please use an image under 8 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, image_url: result.file_url, alt_text: f.alt_text || file.name.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "") }));
      toast({ title: "Image uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const bulkUpload = async (event) => {
    const files = Array.from(event.target.files || []).filter(file => file.type.startsWith("image/"));
    if (!files.length) return;
    if (files.some(file => file.size > 8 * 1024 * 1024)) {
      toast({ title: "One or more images are too large", description: "Please keep each image under 8 MB.", variant: "destructive" });
      event.target.value = "";
      return;
    }
    setBulkUploading(true);
    try {
      const highestOrder = slides.reduce((max, slide) => Math.max(max, Number(slide.display_order) || 0), -1);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.DashboardSlide.create({
          image_url: result.file_url,
          alt_text: file.name.replace(/[-_]/g, " ").replace(/\.[^.]+$/, ""),
          title: "",
          body: "",
          cta_label: "",
          cta_url: "",
          slide_type: "image",
          placement: "both",
          display_order: highestOrder + i + 1,
          is_active: true,
          starts_at: null,
          ends_at: null,
        });
      }
      toast({ title: `${files.length} image${files.length === 1 ? "" : "s"} added`, description: "They are now active on the dashboard and web carousel." });
      await load();
    } catch (e) {
      toast({ title: "Bulk upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkUploading(false);
      event.target.value = "";
    }
  };

  const save = async () => {
    if (!form.image_url) {
      toast({ title: "Upload an image first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        display_order: Number(form.display_order) || 0,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      if (editingId) await base44.entities.DashboardSlide.update(editingId, payload);
      else await base44.entities.DashboardSlide.create(payload);
      toast({ title: editingId ? "Slide updated" : "Slide added" });
      reset();
      await load();
    } catch (e) {
      toast({ title: "Could not save slide", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const edit = (slide) => {
    setEditingId(slide.id);
    setForm({
      ...blank,
      ...slide,
      starts_at: slide.starts_at ? new Date(slide.starts_at).toISOString().slice(0, 16) : "",
      ends_at: slide.ends_at ? new Date(slide.ends_at).toISOString().slice(0, 16) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggle = async (slide) => {
    await base44.entities.DashboardSlide.update(slide.id, { is_active: !slide.is_active });
    await load();
  };

  const remove = async (slide) => {
    if (!confirm("Delete this slide?")) return;
    await base44.entities.DashboardSlide.delete(slide.id);
    if (editingId === slide.id) reset();
    await load();
  };

  if (loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <AdminPageHeader title="Dashboard & web media" subtitle="Upload and manage rotating images, feature announcements and promotional slides" />

        <div className="rounded-2xl border border-border/60 bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Add several photos at once</p>
            <p className="text-xs text-muted-foreground mt-1">Select multiple images from your device. Each image becomes an active slide on both the dashboard and web.</p>
          </div>
          <label className={`inline-flex items-center justify-center h-10 px-4 rounded-xl text-sm font-semibold bg-primary text-primary-foreground cursor-pointer ${bulkUploading ? "opacity-60 pointer-events-none" : ""}`}>
            {bulkUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {bulkUploading ? "Uploading..." : "Upload multiple"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={bulkUpload} disabled={bulkUploading} />
          </label>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] gap-6 items-start">
          <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold">{editingId ? "Edit slide" : "Add a slide"}</h2>
              <p className="text-xs text-muted-foreground mt-1">Images are stored by Base44 and can be reused on the dashboard, web, or both.</p>
            </div>

            <div className="space-y-2">
              <Label>Image</Label>
              <label className="flex min-h-32 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-center">
                <input type="file" accept="image/*" className="hidden" onChange={uploadImage} disabled={uploading} />
                {form.image_url ? (
                  <img src={form.image_url} alt="Preview" className="max-h-56 w-full rounded-xl object-cover" />
                ) : (
                  <div><ImagePlus className="w-7 h-7 mx-auto text-primary mb-2"/><p className="text-sm font-medium">Choose an image</p><p className="text-xs text-muted-foreground mt-1">JPG, PNG or WebP, up to 8 MB</p></div>
                )}
              </label>
              {uploading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Uploading image...</p>}
              {form.image_url && <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-primary"><Upload className="w-3.5 h-3.5"/> Replace image<input type="file" accept="image/*" className="hidden" onChange={uploadImage} disabled={uploading}/></label>}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Headline (optional)</Label><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Keep the conversation going" /></div>
              <div className="space-y-1.5"><Label>Image description</Label><Input value={form.alt_text} onChange={e=>setForm(f=>({...f,alt_text:e.target.value}))} placeholder="Friends talking over coffee" /></div>
            </div>

            <div className="space-y-1.5"><Label>Supporting text (optional)</Label><Textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} rows={3} placeholder="Short, natural copy for this slide" /></div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Slide type</Label><Select value={form.slide_type} onValueChange={v=>setForm(f=>({...f,slide_type:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="image">Image</SelectItem><SelectItem value="feature">Feature announcement</SelectItem><SelectItem value="promotion">Promotion</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Show on</Label><Select value={form.placement} onValueChange={v=>setForm(f=>({...f,placement:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="dashboard">Dashboard only</SelectItem><SelectItem value="web">Web only</SelectItem><SelectItem value="both">Dashboard and web</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Display order</Label><Input type="number" value={form.display_order} onChange={e=>setForm(f=>({...f,display_order:e.target.value}))}/></div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Button label (optional)</Label><Input value={form.cta_label} onChange={e=>setForm(f=>({...f,cta_label:e.target.value}))} placeholder="See what is new" /></div>
              <div className="space-y-1.5"><Label>Button link (optional)</Label><Input value={form.cta_url} onChange={e=>setForm(f=>({...f,cta_url:e.target.value}))} placeholder="/smart-messages or https://..." /></div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Start showing (optional)</Label><Input type="datetime-local" value={form.starts_at} onChange={e=>setForm(f=>({...f,starts_at:e.target.value}))}/></div>
              <div className="space-y-1.5"><Label>Stop showing (optional)</Label><Input type="datetime-local" value={form.ends_at} onChange={e=>setForm(f=>({...f,ends_at:e.target.value}))}/></div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/50 p-3"><div><p className="text-sm font-medium">Active</p><p className="text-xs text-muted-foreground">Inactive slides remain saved but are not shown.</p></div><Switch checked={form.is_active} onCheckedChange={v=>setForm(f=>({...f,is_active:v}))}/></div>

            <div className="flex gap-2"><Button onClick={save} disabled={saving||uploading}>{saving?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:null}{editingId?"Save changes":"Add slide"}</Button>{editingId&&<Button variant="outline" onClick={reset}>Cancel</Button>}</div>
          </div>

          <div className="space-y-3">
            <div><h2 className="text-sm font-semibold">Current slides</h2><p className="text-xs text-muted-foreground mt-1">Lower display-order numbers appear first.</p></div>
            {slides.length===0 && <div className="rounded-2xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">No uploaded slides yet.</div>}
            {slides.map(slide=><div key={slide.id} className="bg-card border border-border/60 rounded-2xl overflow-hidden"><img src={slide.image_url} alt={slide.alt_text||slide.title||"Slide"} className="w-full h-36 object-cover"/><div className="p-4"><div className="flex items-start gap-2"><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{slide.title||"Image slide"}</p><p className="text-xs text-muted-foreground mt-0.5 capitalize">{slide.placement||"both"} · order {slide.display_order??0} · {slide.slide_type||"image"}</p></div><span className={`text-[10px] px-2 py-1 rounded-full ${slide.is_active?"bg-success/10 text-success":"bg-muted text-muted-foreground"}`}>{slide.is_active?"Active":"Hidden"}</span></div>{slide.body&&<p className="text-xs text-muted-foreground mt-2 line-clamp-2">{slide.body}</p>}<div className="flex gap-1 mt-3"><Button size="sm" variant="outline" onClick={()=>edit(slide)}><Pencil className="w-3.5 h-3.5 mr-1"/>Edit</Button><Button size="sm" variant="outline" onClick={()=>toggle(slide)}>{slide.is_active?<EyeOff className="w-3.5 h-3.5 mr-1"/>:<Eye className="w-3.5 h-3.5 mr-1"/>}{slide.is_active?"Hide":"Show"}</Button><Button size="sm" variant="outline" className="text-destructive" onClick={()=>remove(slide)}><Trash2 className="w-3.5 h-3.5"/></Button></div></div></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
