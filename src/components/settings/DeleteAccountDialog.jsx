import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const CONFIRM_TEXT = "DELETE";

export default function DeleteAccountDialog({ open, onOpenChange }) {
  const [step, setStep] = useState(1);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setStep(1);
    setConfirmText("");
    setDeleting(false);
    setDone(false);
  };

  const handleClose = (open) => {
    if (!open && !deleting) {
      reset();
    }
    onOpenChange(open);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("deleteAccount", {});
      if (res.data?.success) {
        setDone(true);
        toast({ title: "Account deleted", description: "Your data has been removed." });
        setTimeout(async () => {
          try {
            const { default: LocalCleanupService } = await import("@/services/mobile/LocalCleanupService");
            await LocalCleanupService.beforeLogout();
          } catch { /* non-blocking */ }
          base44.auth.logout("/login");
        }, 2000);
      } else {
        throw new Error(res.data?.error || "Deletion failed");
      }
    } catch (e) {
      toast({
        title: "Deletion failed",
        description: e.message || "Please try again or contact support.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center">Account deleted</AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                Your personal data has been removed. Financial records were retained as required by law.
                You will be logged out shortly.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
        ) : step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Delete account
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left">
                This will permanently delete your account and associated data:
              </AlertDialogDescription>
            </AlertDialogHeader>

            <ul className="text-xs text-muted-foreground space-y-1.5 my-3 ml-1">
              <li>• All Communication Plans and messages</li>
              <li>• Device tokens and push notifications</li>
              <li>• Referral codes (deactivated)</li>
              <li>• Notification history</li>
              <li>• Subscription (cancelled)</li>
            </ul>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
              <p className="text-xs text-amber-800">
                <strong>Retained for legal/audit:</strong> Reward ledger entries, billing records,
                and anonymized referral/payout records will be preserved as required by law.
                See our{" "}
                <a
                  href="https://borisend.com/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Privacy Policy
                </a>. This action cannot be undone.
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => setStep(2)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Final confirmation
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left">
                Type <strong className="text-destructive">{CONFIRM_TEXT}</strong> to permanently delete your account.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_TEXT}
              className="my-3"
              autoFocus
              autoComplete="off"
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Back</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting || confirmText !== CONFIRM_TEXT}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Deleting...</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" /> Delete forever</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}