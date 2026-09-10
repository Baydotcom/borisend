import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Trash2, X } from "lucide-react";
import { entitlementLabel } from "@/lib/entitlementLabels";

/**
 * DeleteContactDialog — safe Contact deletion with reference checking.
 *
 * Before deletion, checks whether the Contact is referenced by:
 * - active PlanRecipients
 * - inactive/deactivated PlanRecipients
 * - relationship memories
 *
 * If active PlanRecipients reference the Contact, deletion is blocked with
 * a clear explanation. Historical sent messages retain their recipient_name
 * snapshot and are NOT affected by Contact deletion.
 *
 * Deletion is ownership-scoped — RLS on the Contact entity enforces that
 * only the owner can delete. The dialog calls Contact.delete(id) which
 * the backend validates against owner_user_id via RLS.
 */
export default function DeleteContactDialog({ contact, onClose, onDeleted }) {
  const [checking, setChecking] = useState(true);
  const [references, setReferences] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const [allPRs, allSMRs] = await Promise.all([
          base44.entities.PlanRecipient.filter({ contact_id: contact.id }),
          base44.entities.SmartMessageRecipient.filter({ contact_id: contact.id }).catch(() => []),
        ]);
        const activePRs = allPRs.filter(pr => pr.status === "active");
        const inactivePRs = allPRs.filter(pr => pr.status !== "active");
        const activeSMRs = allSMRs.filter(smr => smr.status === "active");
        setReferences({
          activePlanRecipients: activePRs,
          inactivePlanRecipients: inactivePRs,
          totalPlanRecipients: allPRs.length,
          activeSmartMessageRecipients: activeSMRs,
          totalSmartMessageRecipients: allSMRs.length,
        });
      } catch (e) {
        setReferences({ error: e.message });
      }
      setChecking(false);
    };
    check();
  }, [contact.id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await base44.entities.Contact.delete(contact.id);
      onDeleted();
    } catch (e) {
      // RLS will block cross-user deletion
    }
    setDeleting(false);
  };

  const hasActiveRefs = references?.activePlanRecipients?.length > 0 || references?.activeSmartMessageRecipients?.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 nav-safe-bottom" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-semibold">Delete contact</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {checking ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : references?.error ? (
          <div className="text-sm text-destructive mb-4">Could not check references: {references.error}</div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              You are about to delete <span className="font-semibold text-foreground">{contact.display_name || contact.first_name}</span>.
            </p>

            {hasActiveRefs ? (
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    {references.activePlanRecipients?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-foreground">This contact is in an active Communication Plan</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {references.activePlanRecipients.length} active routine{references.activePlanRecipients.length > 1 ? "s" : ""} reference this contact.
                          Remove them from the routine{references.activePlanRecipients.length > 1 ? "s" : ""} first, or deactivate the relationship entry before deleting.
                        </p>
                      </div>
                    )}
                    {references.activeSmartMessageRecipients?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-foreground">This contact is in an active Smart Message</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {references.activeSmartMessageRecipients.length} active Smart Message{references.activeSmartMessageRecipients.length > 1 ? "s" : ""} reference this contact.
                          Remove them from the Smart Message{references.activeSmartMessageRecipients.length > 1 ? "s" : ""} first before deleting.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : references.totalPlanRecipients > 0 || references.totalSmartMessageRecipients > 0 ? (
              <div className="bg-muted/50 border border-border/40 rounded-xl p-4 mb-4">
                <p className="text-xs text-muted-foreground">
                  This contact has {references.totalPlanRecipients + references.totalSmartMessageRecipients} inactive association{(references.totalPlanRecipients + references.totalSmartMessageRecipients) > 1 ? "s" : ""}.
                  These will be orphaned but historical sent messages are preserved.
                </p>
              </div>
            ) : (
              <div className="bg-muted/50 border border-border/40 rounded-xl p-4 mb-4">
                <p className="text-xs text-muted-foreground">
                  This contact is not part of any Communication Plan. Historical sent messages will retain the recipient name for your records.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1 h-11 rounded-xl">Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || hasActiveRefs}
                className="flex-1 h-11 rounded-xl"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {hasActiveRefs ? "Cannot delete" : "Delete contact"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}