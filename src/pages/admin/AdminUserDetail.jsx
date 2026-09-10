import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import AdminPageHeader from "@/components/layout/AdminPageHeader";
import {
  Loader2, Mail, Calendar, Globe, Clock, ShieldCheck, Crown,
  Package, Users, Layers, AlertTriangle, Lock
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

export default function AdminUserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [changingRole, setChangingRole] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [res, me] = await Promise.all([
          base44.functions.invoke("adminGetUserDetail", { user_id: id }),
          base44.auth.me(),
        ]);
        setData(res.data);
        setCanManageRoles(me.role === "super_admin");
        setCurrentUserId(me.id);
      } catch (e) {
        toast({ title: "Could not load user", description: e.message, variant: "destructive" });
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleRoleChange = async (newRole) => {
    if (!confirm(`Change this user's role to ${newRole}?`)) return;
    setChangingRole(true);
    try {
      await base44.functions.invoke("adminUpdateUserRole", {
        target_user_id: id,
        new_role: newRole,
      });
      setData(d => ({ ...d, identity: { ...d.identity, role: newRole } }));
      toast({ title: `Role changed to ${newRole}` });
    } catch (e) {
      toast({ title: "Could not change role", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setChangingRole(false);
    }
  };

  if (loading) {
    return (
      <div>
        <AdminPageHeader title="User Detail" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <AdminPageHeader title="User Detail" />
        <div className="text-center py-12 text-sm text-muted-foreground">User not found.</div>
      </div>
    );
  }

  const { identity, commercial, product } = data;
  const roleColors = {
    super_admin: "bg-primary/15 text-primary",
    admin: "bg-info/15 text-info",
    user: "bg-muted text-muted-foreground",
  };

  return (
    <div>
      <AdminPageHeader title="User Detail" showHome />

      <div className="px-4 py-4 space-y-4">
        {/* Identity */}
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xl">
              {(identity.full_name?.[0] || "U").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-heading font-semibold truncate">{identity.full_name || "Unnamed"}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleColors[identity.role] || roleColors.user}`}>
                  {identity.role}
                </span>
                {identity.profile_status !== "active" && (
                  <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
                    {identity.profile_status}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate">{identity.email || "—"}</p>
              </div>
            </div>

            {identity.borisend_user_id && (
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">BoriSend ID</p>
                  <p className="text-sm font-medium font-mono">{identity.borisend_user_id}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Registered</p>
                <p className="text-sm font-medium">
                  {identity.created_date ? new Date(identity.created_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}
                </p>
              </div>
            </div>

            {identity.timezone && (
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Timezone</p>
                  <p className="text-sm font-medium">{identity.timezone.replace("_", " ")}</p>
                </div>
              </div>
            )}

            {identity.language && (
              <div className="flex items-start gap-3">
                <Globe className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Language</p>
                  <p className="text-sm font-medium uppercase">{identity.language}</p>
                </div>
              </div>
            )}

            {identity.deletion_requested && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 rounded-lg p-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Account deletion requested
              </div>
            )}
          </div>

          {/* Role management (super_admin only, cannot change own role) */}
          {canManageRoles && identity.id !== currentUserId && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Role management</p>
              <Select value={identity.role} onValueChange={handleRoleChange} disabled={changingRole}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1.5">Only Super Admins can change roles.</p>
            </div>
          )}
        </div>

        {/* Commercial */}
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" /> Commercial
          </h3>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Membership</p>
              {commercial.membership ? (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{commercial.membership.config_name || "Membership"}</span>
                    <Badge variant="secondary" className="text-[10px]">{commercial.membership.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {commercial.membership.billing_interval} · {commercial.membership.included_plan_units} plans · {commercial.membership.included_recipient_units} recipients
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active membership</p>
              )}
            </div>

            {commercial.active_addons?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Active add-ons</p>
                <div className="space-y-1">
                  {commercial.active_addons.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                      <span>+{a.quantity} {a.entitlement_type === "communication_plan_units" ? "Plans" : "Recipients"}</span>
                      <Badge variant="secondary" className="text-[10px]">{a.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {commercial.capacity && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Capacity</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Plans</span>
                    </div>
                    <p className="text-sm font-bold">{commercial.capacity.plan.used} / {commercial.capacity.plan.effective}</p>
                    {commercial.capacity.plan.isOverCapacity && (
                      <span className="text-[10px] text-warning">Over capacity</span>
                    )}
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Recipients</span>
                    </div>
                    <p className="text-sm font-bold">{commercial.capacity.recipient.used} / {commercial.capacity.recipient.effective}</p>
                    {commercial.capacity.recipient.isOverCapacity && (
                      <span className="text-[10px] text-warning">Over capacity</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Product */}
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" /> Product
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center bg-muted/50 rounded-lg p-3">
              <p className="text-lg font-bold">{product.total_campaigns}</p>
              <p className="text-[10px] text-muted-foreground">Total Plans</p>
            </div>
            <div className="text-center bg-muted/50 rounded-lg p-3">
              <p className="text-lg font-bold text-success">{product.active_campaigns}</p>
              <p className="text-[10px] text-muted-foreground">Active Plans</p>
            </div>
            <div className="text-center bg-muted/50 rounded-lg p-3">
              <p className="text-lg font-bold">{product.total_contacts}</p>
              <p className="text-[10px] text-muted-foreground">Contacts</p>
            </div>
          </div>
        </div>

        {/* Privacy boundary notice */}
        <div className="bg-muted/30 border border-border/40 rounded-2xl p-4 flex items-start gap-2">
          <Lock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Message content and relationship memory are private. Admin access covers account and commercial information only.
          </p>
        </div>
      </div>
    </div>
  );
}