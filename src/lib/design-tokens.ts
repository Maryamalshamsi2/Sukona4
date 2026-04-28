/**
 * Sukona Design Tokens — TypeScript Reference
 *
 * Source of truth: src/app/globals.css @theme block
 *
 * This file documents the official token structure and maps
 * each token to the Tailwind class that consumes it.
 * Import values from here when you need raw CSS values in JS
 * (e.g. charts, canvas, inline styles).
 *
 * For normal component styling, use the Tailwind classes directly.
 */

// ────────────────────────────────────────────────────
// COLORS — Neutral
// Tailwind: bg-neutral-{n}, text-neutral-{n}, border-neutral-{n}
// ────────────────────────────────────────────────────
export const neutral = {
  0: "#FFFFFF",
  25: "#FAFAFA",
  50: "#F5F5F7",
  100: "#E8E8ED",
  200: "#D2D2D7",
  300: "#B0B0B8",
  400: "#86868B",
  500: "#6E6E73",
  600: "#48484A",
  700: "#3A3A3C",
  800: "#2C2C2E",
  900: "#1D1D1F",
  950: "#0D0D0D",
} as const;

// ────────────────────────────────────────────────────
// COLORS — Primary
// Tailwind: bg-primary-{n}, text-primary-{n}, border-primary-{n}
// ────────────────────────────────────────────────────
export const primary = {
  50: "#FFF8F1",
  100: "#FEEAD2",
  200: "#FDDBB3",
  300: "#FBB97A",
  400: "#F59E4B",
  500: "#F08C2D",
  600: "#E27B1A",
  700: "#C46515",
  800: "#9E5013",
  900: "#7A3E12",
  950: "#4A2409",
} as const;

// ────────────────────────────────────────────────────
// COLORS — Semantic
// Tailwind: bg-success-{n}, text-error-{n}, etc.
// ────────────────────────────────────────────────────
export const semantic = {
  success: { 50: "#F0FDF4", 500: "#22C55E", 700: "#15803D" },
  warning: { 50: "#FFFBEB", 500: "#F59E0B", 700: "#B45309" },
  error: { 50: "#FEF2F2", 500: "#EF4444", 700: "#B91C1C" },
} as const;

// ────────────────────────────────────────────────────
// COLORS — Surfaces, text & borders
// Tailwind: bg-bg, bg-surface, bg-surface-hover, etc.
//           text-text-primary, text-text-secondary
//           border-border, border-border-strong
// ────────────────────────────────────────────────────
export const surfaces = {
  bg: "#F5F5F7",
  surface: "#FFFFFF",
  surfaceHover: "rgba(0, 0, 0, 0.02)",
  surfaceActive: "rgba(0, 0, 0, 0.04)",
  border: "rgba(0, 0, 0, 0.04)",
  borderStrong: "rgba(0, 0, 0, 0.08)",
  overlay: "rgba(0, 0, 0, 0.40)",
  textPrimary: "#1A1A1A",
  textSecondary: "#666666",
  textTertiary: "#86868B",
  textDisabled: "#B0B0B8",
  textInverse: "#FFFFFF",
} as const;

// ────────────────────────────────────────────────────
// TYPOGRAPHY — Role-based responsive scale
//
// OFFICIAL roles map to custom Tailwind utilities.
// Mobile-first; desktop sizes kick in at ≥768px via
// CSS variable overrides in globals.css.
//
// Role   Tailwind class        Mobile     Desktop    Weight       Tracking
// ────────────────────────────────────────────────────────────────────────
// H1     text-title-page       32px/1.15  48px/1.1   700 Bold     -0.02em
// H2     text-title-section    24px/1.2   32px/1.2   600 Semibold -0.01em
// H3     text-title-card       24px/1.3   24px/1.3   500 Medium   —
// Body   text-body             16px/1.6   16px/1.6   400 Regular  —
// Body·  text-body-sm          14px/1.5   14px/1.5   400 Regular  —
// Capt.  text-caption          13px/1.4   13px/1.4   500 Medium   —
//
// The --font-weight modifier is baked into each token, so
// `<h1 className="text-title-page">` produces the correct
// size + weight + tracking without additional classes.
// ────────────────────────────────────────────────────
export const typography = {
  pageTitle:    { mobilePx: 30, desktopPx: 40, class: "text-title-page",    weight: 700, lineHeightMobile: 1.15, lineHeightDesktop: 1.1, letterSpacing: "-0.02em" },
  sectionTitle: { mobilePx: 22, desktopPx: 26, class: "text-title-section", weight: 600, lineHeightMobile: 1.2,  lineHeightDesktop: 1.2, letterSpacing: "-0.01em" },
  cardTitle:    { mobilePx: 24, desktopPx: 24, class: "text-title-card",    weight: 500, lineHeightMobile: 1.3,  lineHeightDesktop: 1.3, letterSpacing: "normal"  },
  body:         { mobilePx: 16, desktopPx: 16, class: "text-body",          weight: 400, lineHeightMobile: 1.6,  lineHeightDesktop: 1.6, letterSpacing: "normal"  },
  bodySm:       { mobilePx: 14, desktopPx: 14, class: "text-body-sm",       weight: 400, lineHeightMobile: 1.5,  lineHeightDesktop: 1.5, letterSpacing: "normal"  },
  caption:      { mobilePx: 13, desktopPx: 13, class: "text-caption",       weight: 500, lineHeightMobile: 1.4,  lineHeightDesktop: 1.4, letterSpacing: "normal"  },
} as const;

// Optimal reading measure — ~65 characters per line.
export const maxProse = "65ch";

// ────────────────────────────────────────────────────
// SHADOWS
// Tailwind: shadow-xs, shadow-sm, shadow-md, shadow-lg, shadow-xl
// ────────────────────────────────────────────────────
export const shadow = {
  xs: "0 1px 2px rgba(0, 0, 0, 0.04)",
  sm: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -2px rgba(0, 0, 0, 0.04)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.06), 0 4px 6px -4px rgba(0, 0, 0, 0.04)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
} as const;

// ────────────────────────────────────────────────────
// TRANSITIONS
// Tailwind: duration-fast, duration-normal, duration-slow
// ────────────────────────────────────────────────────
export const duration = {
  fast: "100ms",
  normal: "200ms",
  slow: "300ms",
} as const;

export const easing = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";

// ────────────────────────────────────────────────────
// LEGACY COMPATIBILITY NOTES
//
// The following patterns exist in the current codebase.
// They still work but should migrate to official tokens:
//
// Legacy class/pattern           →  Official replacement
// ─────────────────────────────────────────────────────
// bg-[#F5F5F7]                   →  bg-bg  or  bg-neutral-50
// bg-black/[0.02]                →  bg-surface-hover
// bg-black/[0.04]                →  bg-surface-active
// ring-black/[0.04]              →  ring-border  or  border-border
// text-gray-900                  →  text-text-primary
// text-gray-500                  →  text-text-secondary
// text-gray-400                  →  text-text-tertiary
// text-[15px] font-semibold      →  text-title-section font-semibold
// text-[13px]                    →  text-body-sm (now 14px)
// text-xs (12px, unchanged)      →  text-caption
// text-[10px]                    →  text-caption (bump to 12px)
// text-[11px]                    →  text-caption (bump to 12px)
// bg-violet-*                    →  bg-primary-*
// text-violet-*                  →  text-primary-*
// ────────────────────────────────────────────────────
