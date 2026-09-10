import React from "react";
import { Info, Shield, FileText, Mail, Bug, ChevronRight, Scale } from "lucide-react";
import { Link } from "react-router-dom";

const APP_VERSION = "v1.0.0";

function detectPlatform() {
  if (typeof window === "undefined") return "Web";
  const ua = navigator.userAgent || "";
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  if (/Android/i.test(ua)) return isStandalone ? "PWA (Android)" : "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return isStandalone ? "PWA (iOS)" : "iOS";
  if (isStandalone) return "PWA";
  return "Web";
}

function buildBugReportUrl() {
  const platform = detectPlatform();
  const body = [
    "BoriSend Bug Report",
    "",
    `App Version: ${APP_VERSION}`,
    `Platform: ${platform}`,
    "Device: ",
    "",
    "Reproduction Steps:",
    "1. ",
    "2. ",
    "3. ",
    "",
    "Expected behavior:",
    "",
    "Actual behavior:",
    "",
    "Additional notes:",
    "",
  ].join("\n");
  return `mailto:borisend@macpeniel.com?subject=${encodeURIComponent(
    "BoriSend Bug Report"
  )}&body=${encodeURIComponent(body)}`;
}

export default function AboutSection() {
  const linkItems = [
    { icon: Scale, label: "Legal Centre", url: "https://borisend.com/legal", external: true },
    { icon: Shield, label: "Privacy Policy", url: "https://borisend.com/legal/privacy", external: true },
    { icon: FileText, label: "Terms of Service", url: "https://borisend.com/legal/terms", external: true },
    { icon: Mail, label: "Contact Support", to: "/support", external: false },
    { icon: Bug, label: "Report a Bug", to: "/support", external: false },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" /> About
      </h3>

      {/* Links */}
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        {linkItems.map((item, idx) => {
          const content = (
            <>
              <div className="flex items-center gap-2.5">
                <item.icon className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </>
          );
          const className = `flex items-center justify-between p-4 hover:bg-muted/50 transition-colors no-select ${
            idx < linkItems.length - 1 ? "border-b border-border/30" : ""
          }`;
          return item.external ? (
            <a
              key={idx}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {content}
            </a>
          ) : (
            <Link key={idx} to={item.to} className={className}>
              {content}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center pt-2 space-y-0.5">
        <p className="text-sm font-semibold text-muted-foreground">BoriSend {APP_VERSION}</p>
        <p className="text-xs text-muted-foreground/60">© 2026 Macpeniel Limited</p>
        <p className="text-xs text-muted-foreground/60">All rights reserved.</p>
      </div>
    </div>
  );
}