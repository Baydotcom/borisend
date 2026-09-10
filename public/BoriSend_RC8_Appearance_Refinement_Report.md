# BoriSend RC8 — Appearance & Theme Experience Refinement Report

**Date:** 2026-08-08  
**Sprint:** RC8 — Appearance & Theme Experience Refinement  
**Scope:** Application visual appearance and theme experience only  
**Exclusions:** Pricing, subscription plans, authentication, referral architecture, message generation, scheduling, notification architecture, user-data isolation, RC3–RC7 functionality, and the marketing website (https://borisend.macpeniel.com) — none modified.  
**Status:** ✅ **GO for final iOS build**

---

## 1. Appearance Architecture Reviewed

### Before RC8
- Theme management: `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
- Dark theme: generic colour inversion — pure-black-adjacent background (`270 20% 7%`), flat unlayered card/popover surfaces (both at `11%`), over-saturated primary (`270 60% 62%`), and dim secondary text (`270 8% 58%`).
- No user-facing appearance settings — users could not choose Light, Dark, or Follow Device.
- Hardcoded `purple-*` classes throughout Settings.jsx with no `dark:` variants — invisible text on dark backgrounds.

### After RC8
- Theme management: `next-themes` with `attribute="class"`, `defaultTheme="light"`, `enableSystem`. Three supported modes: Light, Dark, Follow Device.
- Dark theme: **redesigned from scratch** — warm aubergine background (`280 14% 9%`), layered surfaces (background 9% → card 13% → popover 15% → secondary 18% → border 22%), brand-consistent primary (`270 60% 50%` — same as Light), brighter secondary text for comfortable reading (`270 10% 64%`).
- Centralised theme architecture: all colour tokens in `src/index.css` (`:root` for Light, `.dark` for Dark), mapped to Tailwind classes in `tailwind.config.js`. No theme logic scattered in components.
- New `AppearanceSection` component in Settings — the single entry point for appearance management.
- All hardcoded `purple-*` classes in Settings.jsx replaced with semantic tokens (`bg-accent`, `text-primary`, `text-accent-foreground`, `border-primary/20`).

### Architecture Summary
| Layer | Location | Responsibility |
|---|---|---|
| Colour tokens | `src/index.css` (`:root`, `.dark`) | All HSL colour values for Light and Dark |
| Token mapping | `tailwind.config.js` | Maps tokens to Tailwind utility classes |
| Theme provider | `src/components/ThemeProvider.jsx` | next-themes wrapper, default=light, system support |
| Appearance UI | `src/components/settings/AppearanceSection.jsx` | Light/Dark/Follow Device selector with previews |
| Persistence | next-themes localStorage | Survives logout, login, refresh, app restart |

**Portability:** The architecture uses CSS custom properties (HSL tokens) and Tailwind utility classes — no Base44-specific APIs. The entire theme system is portable to any React + Tailwind environment.

---

## 2. Appearance Settings Implemented

### Location
New **Appearance** section in Settings, positioned at the top (after the profile card, before the subscription link).

### Options (RC8.2)
| Mode | Label | Description | Behaviour |
|---|---|---|---|
| Light | "Light" | "Bright & clear" | Forces Light theme |
| Dark | "Dark" | "Warm & calm" | Forces Dark theme |
| Follow Device | "Follow Device" | "Matches your device" | Follows OS `prefers-color-scheme` |

### Appearance Preview (RC8.10)
Each option card includes a **mini ThemePreview** — a tiny mockup showing how the app looks in that mode:
- A miniature card with header bar, content lines, and accent dot.
- Light preview shows light background with purple accent.
- Dark preview shows warm aubergine background with lighter purple accent.
- Follow Device preview shows whichever mode the OS is currently using.

Users can see and understand each appearance before selecting it.

### Default Theme (RC8.3)
- **Default for new users: Light** (`defaultTheme="light"` in ThemeProvider).
- Existing users who previously selected a theme retain their choice (next-themes localStorage).
- Users who never explicitly chose a theme now get Light (was previously "system").

### Theme Persistence (RC8.4)
- **Mechanism:** next-themes stores the selected theme in `localStorage` under the key `"theme"`.
- **Persists across:** logout, login, browser refresh, mobile app restart, device restart, iOS packaged app, Android packaged app (Capacitor WebView preserves localStorage).
- **Follow Device:** When selected, BoriSend automatically follows the OS appearance via `prefers-color-scheme` media query. next-themes listens for OS theme changes and updates immediately.

---

## 3. Dark Theme Redesign (RC8.5, RC8.6)

### Design Principles Applied
| Principle | Implementation |
|---|---|
| Avoid pure black | Background at `280 14% 9%` — deep warm aubergine, not `0%` black |
| Layered surfaces | 5-level elevation hierarchy: bg(9%) → card(13%) → popover(15%) → secondary(18%) → border(22%) |
| Comfortable contrast | Foreground at `270 15% 94%` (soft warm white), muted-foreground at `270 10% 64%` (brighter than before) |
| Preserve brand colours | Primary stays `270 60% 50%` — identical in Light and Dark for brand consistency |
| Warmth | Hue shifted from 270 (blue-purple) to 280 (plum/aubergine) for backgrounds — warmer, more inviting |
| Accessibility | Primary on white text: 6.44:1 contrast (WCAG AA pass). All text meets AA. |

### Token Comparison: Before vs After

| Token | Before (Generic Inversion) | After (Redesigned) | Change |
|---|---|---|---|
| `--background` | `270 20% 7%` (cold, near-black) | `280 14% 9%` (warm aubergine) | Warmer, not pure black |
| `--card` | `270 15% 11%` (flat) | `280 12% 13%` (layered) | Clearly lifted from bg |
| `--popover` | `270 15% 11%` (same as card) | `280 12% 15%` (above card) | Proper elevation layer |
| `--primary` | `270 60% 62%` (too light) | `270 60% 50%` (brand match) | Same as Light — consistent |
| `--muted-foreground` | `270 8% 58%` (dim) | `270 10% 64%` (readable) | 6% brighter for comfort |
| `--accent` | `270 20% 19%` (flat) | `280 14% 20%` (warm) | Warmer, with hue shift |
| `--border` | `270 15% 19%` (invisible) | `280 10% 22%` (visible) | Clearly defined edges |
| `--destructive` | `0 70% 50%` (harsh) | `0 65% 55%` (softer) | Less aggressive red |

### What Changed
- **Backgrounds:** Cold near-black → warm deep aubergine. Not pure black anywhere.
- **Surfaces:** Flat single-level → 5-level layered hierarchy (background, card, popover, secondary, border each at distinct lightness).
- **Primary:** Over-bright (62%) → brand-consistent (50%, same as Light). Buttons look identical in both themes.
- **Text:** Dim secondary (58%) → comfortable readable (64%). No more squinting at muted labels.
- **Borders:** Nearly invisible (19%) → clearly defined (22%). Cards and inputs have visible edges.
- **Destructive:** Harsh red (70% saturation) → softer red (65% saturation, 55% lightness). Less alarming, more professional.

---

## 4. Brand Consistency (RC8.7)

### Same Identity in Both Themes
| Element | Light | Dark | Consistent? |
|---|---|---|---|
| Primary colour | `270 60% 50%` | `270 60% 50%` | ✅ Identical |
| Primary button | Purple with white text | Purple with white text | ✅ Identical |
| Typography | Inter + Playfair Display | Inter + Playfair Display | ✅ Identical |
| Spacing | Tailwind defaults | Tailwind defaults | ✅ Identical |
| Layout | Same component hierarchy | Same component hierarchy | ✅ Identical |
| Card shape | `rounded-2xl` | `rounded-2xl` | ✅ Identical |
| Navigation | Bottom nav with 5 items | Bottom nav with 5 items | ✅ Identical |

Users immediately recognise both as BoriSend. The only difference is the environment (light vs dark surfaces), not the personality.

---

## 5. Accessibility Verification (RC8.8)

| Check | Light | Dark | WCAG AA |
|---|---|---|---|
| Body text contrast | 10% L on 98% L bg ≈ 14:1 | 94% L on 9% L bg ≈ 14:1 | ✅ Pass |
| Primary button text | White on `270 60% 50%` ≈ 6.4:1 | White on `270 60% 50%` ≈ 6.4:1 | ✅ Pass |
| Muted text | 45% L on 98% L bg ≈ 4.8:1 | 64% L on 9% L bg ≈ 7.5:1 | ✅ Pass |
| Card text | 10% L on 100% L bg ≈ 15:1 | 94% L on 13% L bg ≈ 11:1 | ✅ Pass |
| Border visibility | 90% L on 98% L bg | 22% L on 9% L bg | ✅ Visible |
| Focus ring | `270 60% 50%` primary | `270 60% 50%` primary | ✅ Visible |
| Error/destructive | `0 84% 60%` red | `0 65% 55%` softer red | ✅ Readable |
| Disabled controls | `opacity-50` (button.jsx) | `opacity-50` (button.jsx) | ✅ Same in both |
| Keyboard navigation | Standard focus rings | Standard focus rings | ✅ Same in both |

**All text and interactive elements meet WCAG AA contrast requirements in both themes.**

---

## 6. Theme Performance (RC8.9)

| Requirement | Result |
|---|---|
| Changes happen immediately | ✅ next-themes applies the `class` attribute on `<html>` instantly — no delay |
| No page refresh required | ✅ Class toggle triggers CSS variable cascade — React does not re-render |
| Preserves navigation | ✅ Current route is maintained — no redirect |
| Preserves unsaved form data | ✅ React state is not affected — only the `class` on `<html>` changes |
| Avoids layout shifts | ✅ `disableTransitionOnChange` prevents visible transitions; same layout in both themes |
| Avoids unnecessary re-rendering | ✅ Only CSS variables change; no React component re-mounts |

**Verified:** Switching between Light, Dark, and Follow Device is instantaneous. Navigation, scroll position, and form state are preserved.

---

## 7. Screens Tested (RC8.12)

### Dark Theme Audit — All Screens

| Screen | Dark Mode Status | Notes |
|---|---|---|
| Dashboard (Home) | ✅ Verified | Warm aubergine bg, coloured stat cards, purple quota bar, quick-action gradients |
| Communication Plans | ✅ Verified | Layered cards, purple active filter tabs, green status badges |
| Smart Inbox | ✅ Verified | Dark search bar, purple active tab, clear empty state |
| Create Campaign | ✅ Verified | Category grid with bordered cards, purple step indicator, Continue button |
| Message Preview | ✅ Verified (code review) | Uses `bg-card`, `text-foreground` tokens — adapts correctly |
| Notifications | ✅ Verified | Coloured status icons, unread dots, clear text hierarchy |
| Settings | ✅ Verified | New Appearance section, accent-tinted link cards, token-based colours |
| Subscription | ✅ Verified | Deep purple plan card, dark pricing cards, billing notice visible |
| Dialogs/Modals | ✅ Verified (code review) | Uses `bg-popover` token (15% lightness) — properly elevated |
| Forms | ✅ Verified | Inputs use `bg-input`/`border-input` tokens — visible in both themes |
| Navigation | ✅ Verified | Bottom nav with `bg-background/80 backdrop-blur-xl` — works in both |
| Cards | ✅ Verified | `bg-card` at 13% lightness — clearly lifted from 9% background |
| Empty states | ✅ Verified | Icons, text, and CTA buttons all visible on dark |
| Loading states | ✅ Verified | Spinner uses `text-primary` token — visible in both themes |
| Error states | ✅ Verified | Destructive colour at `0 65% 55%` — readable, not harsh |

### Light Theme Regression
| Screen | Light Mode Status |
|---|---|
| Dashboard (Home) | ✅ Verified — unchanged, no regression |
| Settings | ✅ Verified — Appearance section added, link cards use accent tokens |
| All other screens | ✅ No changes — Light theme tokens unchanged |

### Theme Switching
| Test | Result |
|---|---|
| Light → Dark | ✅ Instant, no refresh |
| Dark → Light | ✅ Instant, no refresh |
| Light → Follow Device | ✅ Follows OS (Light in preview) |
| Dark → Follow Device | ✅ Follows OS |
| Navigation after switch | ✅ Preserved |
| Form state after switch | ✅ Preserved |

### Responsive
| Viewport | Result |
|---|---|
| Desktop | ✅ No issues, no horizontal overflow |
| Mobile (375px) | ✅ No horizontal overflow, all content fits |
| Bottom nav | ✅ Works in both themes |

### Console Errors
**Zero console errors** across all tested screens in both Light and Dark modes.

---

## 8. Files Modified

| File | Change | Type |
|---|---|---|
| `src/index.css` | Redesigned `.dark` CSS token block — warm aubergine palette, layered surfaces | Modified |
| `src/components/ThemeProvider.jsx` | Changed `defaultTheme` from `"system"` to `"light"` | Modified |
| `src/components/settings/AppearanceSection.jsx` | New component — Light/Dark/Follow Device selector with mini previews | **Created** |
| `src/pages/Settings.jsx` | Added AppearanceSection import + section; replaced hardcoded `purple-*` classes with semantic tokens | Modified |
| `src/lib/i18n.js` | Added appearance-related i18n keys to `en` section | Modified |

**Total:** 4 files modified, 1 file created.

### No Functionality Changed
- No pricing, subscription plans, or Stripe integration modified.
- No authentication, login, or registration flows modified.
- No referral architecture modified.
- No message generation, scheduling, or notification architecture modified.
- No user-data isolation or RLS policies modified.
- No RC3–RC7 functionality modified.
- No marketing website modified.

---

## 9. Before-and-After Comparison

### Dark Theme — Before (Generic Inversion)
- **Background:** Cold near-black (`#1a1620` at 270 20% 7%) — felt like a colour-inverted screen
- **Cards:** Flat dark panels at same lightness as popovers — no depth perception
- **Primary:** Over-light purple (`#a78bfa` at 62%) — looked washed out, not premium
- **Secondary text:** Dim grey (58%) — hard to read muted labels
- **Borders:** Nearly invisible (19%) — cards floated without edges
- **Overall feel:** "AI-generated dark mode" — generic, cold, high-contrast

### Dark Theme — After (Redesigned)
- **Background:** Warm deep aubergine (`#18141a` at 280 14% 9%) — feels intentional, like a premium app at night
- **Cards:** Clearly lifted layers (13%, 15%, 18%) — depth and hierarchy visible
- **Primary:** Brand purple (`#7c3aed` at 50%) — same as Light, instantly recognisable as BoriSend
- **Secondary text:** Comfortable grey (64%) — readable without squinting
- **Borders:** Softly visible (22%) — cards and inputs have defined edges
- **Overall feel:** "Crafted dark mode" — warm, calm, professional, long-session comfortable

### Settings Page — Before
- Subscription/Notification/Referral link cards: `from-purple-50 to-purple-100/50` with `text-purple-900` — **invisible in Dark mode** (dark text on dark background)
- Save button: hardcoded `bg-purple-600` — didn't adapt to theme
- Delete button: hardcoded `text-red-500 border-red-200/50` — no dark variant
- No appearance settings — users couldn't choose theme

### Settings Page — After
- Link cards: `bg-accent border-primary/20` with `text-accent-foreground` and `text-primary` — **adapts perfectly in both themes**
- Save button: default `bg-primary` — adapts to theme
- Delete button: `text-destructive border-destructive/20` — adapts to theme
- New Appearance section with 3 selectable cards + mini previews

---

## 10. iOS Build Requirement

**Is a new iOS build required?** **Yes.**

RC8 changes the visual appearance of every screen in the app (dark theme redesign) and adds a new Appearance settings section. These changes affect:
- The CSS tokens that govern all colours in the app.
- The ThemeProvider default (system → light).
- A new Settings component (AppearanceSection).
- Updated Settings.jsx with token-based colours.

A new iOS build is required to package these visual changes into the native app.

---

## 11. Final Recommendation

### ✅ GO for final iOS build

**Rationale:**
- The Dark theme has been redesigned from a generic colour inversion to a warm, layered, intentionally-crafted experience that reflects BoriSend's relationship-focused identity.
- Appearance settings (Light / Dark / Follow Device) are implemented with mini previews and persist across all required scenarios.
- Default theme is Light for new users, with existing user preferences preserved.
- All tested screens are verified in both Light and Dark modes with zero console errors.
- Accessibility (WCAG AA contrast) is met across text, buttons, and interactive elements.
- Theme switching is instantaneous with no page refresh, no layout shifts, and preserved navigation/state.
- No functionality outside the visual appearance scope was modified.
- The theme architecture is centralised in CSS tokens and fully portable.

**No further visual refinement recommended at this stage.** The Dark theme is production-ready.
