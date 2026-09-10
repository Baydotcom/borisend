import React, { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

export default function ReferralCodeCard({ referralCode, referralLink }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    toast({ title: "Referral code copied" });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    toast({ title: "Referral link copied" });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on BoriSend",
          text: "Send thoughtful messages automatically. Use my referral code!",
          url: referralLink
        });
      } catch {
        // user cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  if (!referralCode) return null;

  return (
    <div className="bg-primary rounded-2xl p-5 text-primary-foreground">
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-4 h-4 opacity-80" />
        <h3 className="text-sm font-semibold">Your referral code</h3>
      </div>

      <div className="bg-primary-foreground/15 rounded-xl p-3 mb-3">
        <p className="text-2xl font-heading font-bold tracking-wider">{referralCode}</p>
      </div>

      <div className="space-y-2 mb-4">
        <label className="text-xs opacity-80">Shareable link</label>
        <div className="flex gap-2">
          <Input
            readOnly
            value={referralLink}
            className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground text-xs h-9"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopyLink}
            className="bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30 border-0"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleCopyCode}
          variant="secondary"
          className="flex-1 bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30 border-0 h-10"
        >
          {copiedCode ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
          {copiedCode ? "Copied" : "Copy code"}
        </Button>
        <Button
          onClick={handleShare}
          variant="secondary"
          className="flex-1 bg-primary-foreground text-primary hover:bg-primary-foreground/90 border-0 h-10"
        >
          <Share2 className="w-4 h-4 mr-1.5" />
          Share
        </Button>
      </div>
    </div>
  );
}