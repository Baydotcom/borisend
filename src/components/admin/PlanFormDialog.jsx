import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, Eye } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { calculateAnnualPricing, formatCurrency } from "@/lib/pricing";

const EMPTY_FORM = {
  name: "", description: "", price: 0, currency: "GBP",
  monthly_message_limit: 10, max_campaigns: 1,
  is_active: true, is_popular: false, supports_annual: true,
  features: "", sort_order: 0,
  promotional_price: "", promotional_label: "",
  annual_discount_percentage: 0,
};

export default function PlanFormDialog({ open, onOpenChange, editingPlan, onSave, onSync, busy }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (editingPlan) {
      setForm({
        name: editingPlan.name || "",
        description: editingPlan.description || "",
        price: editingPlan.price ?? 0,
        currency: editingPlan.currency || "GBP",
        monthly_message_limit: editingPlan.monthly_message_limit ?? 10,
        max_campaigns: editingPlan.max_campaigns ?? 1,
        is_active: editingPlan.is_active ?? true,
        is_popular: editingPlan.is_popular ?? false,
        supports_annual: editingPlan.supports_annual ?? true,
        features: (editingPlan.features || []).join("\n"),
        sort_order: editingPlan.sort_order ?? 0,
        promotional_price: editingPlan.promotional_price ?? "",
        promotional_label: editingPlan.promotional_label ?? "",
        annual_discount_percentage: editingPlan.annual_discount_percentage ?? 0,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setShowPreview(false);
  }, [editingPlan, open]);

  const pricing = useMemo(
    () => calculateAnnualPricing(form.price, form.annual_discount_percentage),
    [form.price, form.annual_discount_percentage]
  );

  const set = (key) => (e) => {
    const val = e.target ? e.target.value : e;
    setForm((f) => ({ ...f, [key]: val }));
  };

  const buildPayload = () => ({
    ...form,
    price: parseFloat(form.price) || 0,
    monthly_message_limit: parseInt(form.monthly_message_limit) || 0,
    max_campaigns: parseInt(form.max_campaigns) || 1,
    sort_order: parseInt(form.sort_order) || 0,
    features: form.features.split("\n").filter((f) => f.trim()),
    promotional_price: form.promotional_price ? parseFloat(form.promotional_price) : null,
    annual_discount_percentage: parseFloat(form.annual_discount_percentage) || 0,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingPlan ? "Edit plan" : "New plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Basic Info */}
          <div className="space-y-1.5">
            <Label>Plan name</Label>
            <Input value={form.name} onChange={set("name")} className="h-10" placeholder="Starter" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={set("description")} className="h-10" placeholder="Short marketing tagline" />
          </div>

          {/* Pricing — admin only manages monthly price + annual discount */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Pricing</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Monthly Price ({form.currency})</Label>
                <Input type="number" step="0.01" value={form.price} onChange={set("price")} className="h-10" placeholder="3.99" />
              </div>
              <div className="space-y-1">
                <Label>Annual Discount %</Label>
                <Input type="number" step="0.01" value={form.annual_discount_percentage} onChange={set("annual_discount_percentage")} className="h-10" placeholder="16.48" disabled={!form.supports_annual} />
              </div>
            </div>

            {/* Auto-calculated pricing display */}
            {form.supports_annual && form.price > 0 && (
              <div className="bg-white rounded-lg p-2.5 space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Annual</span>
                  <span className="font-medium line-through text-muted-foreground">{formatCurrency(pricing.originalAnnual, form.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount Amount</span>
                  <span className="font-medium text-red-600">−{formatCurrency(pricing.discountAmount, form.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-semibold">Final Annual</span>
                  <span className="font-bold text-primary">{formatCurrency(pricing.finalAnnual, form.currency)}/year</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Display Badge</span>
                  <span className="font-medium text-emerald-600">Save {pricing.roundedDiscountPct}%</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label className="text-xs">Supports annual billing</Label>
              <Switch checked={form.supports_annual} onCheckedChange={(v) => setForm((f) => ({ ...f, supports_annual: v }))} />
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Messages / month</Label>
              <Input type="number" value={form.monthly_message_limit} onChange={set("monthly_message_limit")} className="h-10" placeholder="999999 for unlimited" />
            </div>
            <div className="space-y-1">
              <Label>Max Communication Plans</Label>
              <Input type="number" value={form.max_campaigns} onChange={set("max_campaigns")} className="h-10" placeholder="999999 for unlimited" />
            </div>
          </div>

          {/* Currency + Sort */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} className="h-10" placeholder="GBP" />
            </div>
            <div className="space-y-1">
              <Label>Sort order</Label>
              <Input type="number" value={form.sort_order} onChange={set("sort_order")} className="h-10" />
            </div>
          </div>

          {/* Features */}
          <div className="space-y-1.5">
            <Label>Features (one per line)</Label>
            <textarea
              value={form.features}
              onChange={set("features")}
              rows={4}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
              placeholder="BoriSend-prepared messages&#10;Priority support&#10;Random scheduling"
            />
          </div>

          {/* Promo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Promo price (optional)</Label>
              <Input type="number" step="0.01" value={form.promotional_price} onChange={set("promotional_price")} className="h-10" placeholder="£" />
            </div>
            <div className="space-y-1">
              <Label>Promo label</Label>
              <Input value={form.promotional_label} onChange={set("promotional_label")} className="h-10" placeholder="e.g. 50% off" />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Mark as popular</Label>
            <Switch checked={form.is_popular} onCheckedChange={(v) => setForm((f) => ({ ...f, is_popular: v }))} />
          </div>

          {/* Stripe sync status (when editing) */}
          {editingPlan && editingPlan.stripe_product_id && (
            <div className="bg-muted/50 rounded-lg p-2.5 text-xs space-y-0.5">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide">Stripe Sync</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={`font-medium ${editingPlan.stripe_sync_status === 'synced' ? 'text-emerald-600' : editingPlan.stripe_sync_status === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                  {editingPlan.stripe_sync_status || 'not_synced'}
                </span>
              </div>
              {editingPlan.stripe_product_id && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product</span>
                  <span className="font-mono text-[10px]">{editingPlan.stripe_product_id.substring(0, 20)}...</span>
                </div>
              )}
              {editingPlan.last_synced_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last synced</span>
                  <span>{new Date(editingPlan.last_synced_at).toLocaleString()}</span>
                </div>
              )}
              {editingPlan.stripe_sync_error && (
                <p className="text-red-600 mt-1">{editingPlan.stripe_sync_error}</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button onClick={() => onSave(buildPayload())} variant="outline" className="flex-1 h-10" disabled={busy}>
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save
            </Button>
            <Button onClick={() => onSync(buildPayload())} className="flex-1 h-10 bg-primary hover:bg-primary/90" disabled={busy || form.price === 0}>
              {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Save & Sync
            </Button>
          </div>
          <Button onClick={() => setShowPreview(!showPreview)} variant="ghost" size="sm" className="w-full text-xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> Preview Pricing
          </Button>

          {showPreview && form.price > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="text-center">
                <p className="text-2xl font-bold">{formatCurrency(form.price, form.currency)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                {form.supports_annual && (
                  <>
                    <p className="text-sm text-muted-foreground line-through">{formatCurrency(pricing.originalAnnual, form.currency)}</p>
                    <p className="text-xl font-bold text-primary">{formatCurrency(pricing.finalAnnual, form.currency)}<span className="text-sm font-normal text-muted-foreground">/year</span></p>
                    <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">Save {pricing.roundedDiscountPct}%</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}