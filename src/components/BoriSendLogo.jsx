import React from "react";

/**
 * BORISEND BRAND ASSET — SOURCE OF TRUTH
 *
 * BoriSend has exactly TWO approved canonical logo variants. Both are supplied
 * as final approved artwork and must never be recoloured, redrawn, or recreated.
 *
 *   1. PRIMARY / IN-APP  — Magenta BoriSend logo.
 *      Use: all normal in-application branding (header, auth, marketing preview,
 *      settings, profile, branded empty states, etc.).
 *
 *   2. STARTUP            — White BoriSend logo.
 *      Use: ONLY the solid-Magenta startup / loading screen.
 *
 * Future developers must NOT:
 *   - create additional logo variants;
 *   - recolour one canonical logo to imitate the other;
 *   - upload independent logo copies into individual pages;
 *   - recreate the logo with text/CSS;
 *   - replace one variant without understanding its assigned purpose.
 *
 * All brand changes must flow through these two canonical assets / this component.
 *
 * Props:
 *   variant    — "primary" (default) | "startup"
 *   className   — Tailwind sizing (e.g. "h-9 w-auto"); aspect ratio is always preserved
 *   rounded     — optional corner rounding (defaults to none, to preserve artwork)
 *   alt         — accessible label (default "BoriSend")
 *   decorative  — true → empty alt + aria-hidden (when nearby text already conveys brand)
 */

const PRIMARY_LOGO_URL =
  "https://media.base44.com/images/public/6a3f3ae0473f4e5dce013c32/7e529bff8_Borisendmagenta.png";
const STARTUP_LOGO_URL =
  "https://media.base44.com/images/public/6a3f3ae0473f4e5dce013c32/043a408ec_Borisendwhite.png";

const LOGO_URLS = {
  primary: PRIMARY_LOGO_URL,
  startup: STARTUP_LOGO_URL,
};

export default function BoriSendLogo({
  variant = "primary",
  className = "h-9 w-auto",
  rounded = "",
  alt = "BoriSend",
  decorative = false,
}) {
  const src = LOGO_URLS[variant] || PRIMARY_LOGO_URL;
  return (
    <img
      src={src}
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? "presentation" : undefined}
      className={`${className} ${rounded} object-contain select-none`}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}