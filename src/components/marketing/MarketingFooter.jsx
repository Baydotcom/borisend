import React from "react";
import BoriSendLogo from "@/components/BoriSendLogo";
import { Mail } from "lucide-react";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-border/30 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Company */}
          <div className="space-y-3">
            <div className="flex items-center">
              <BoriSendLogo className="h-11 w-auto" rounded="rounded-lg" />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Macpeniel Limited</p>
              <p>22 Polperro Way</p>
              <p>Hucknall</p>
              <p>England</p>
              <p>United Kingdom</p>
              <p>NG15 6JS</p>
            </div>
          </div>

          {/* Support */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Support</h4>
            <a
              href="mailto:borisend@macpeniel.com"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="w-4 h-4" />
              borisend@macpeniel.com
            </a>
          </div>

          {/* Links */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Legal</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://borisend.macpeniel.com/legal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Legal Centre
                </a>
              </li>
              <li>
                <a
                  href="https://borisend.macpeniel.com/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://borisend.macpeniel.com/legal/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/30 text-center space-y-0.5">
          <p className="text-sm font-semibold text-muted-foreground">BoriSend v1.0.0</p>
          <p className="text-xs text-muted-foreground/60">© 2026 Macpeniel Limited. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}