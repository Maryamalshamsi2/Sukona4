/**
 * Onboarding picker data — the lists each wizard step iterates over.
 *
 * Kept in one file so the codes / labels stay consistent across the
 * wizard, future analytics queries, and the settings page (where a
 * salon can later edit category, team_size, etc.).
 *
 * The string `code` values are what gets persisted to the salons row.
 * Stable, short, snake_case. Labels can be reworded freely.
 */

import type { Plan } from "@/lib/plan";

// ============================================================
// Countries
// ============================================================

/**
 * Curated country picker — GCC + MENA first (where Sukona is
 * launching), then a few neighbors, then a generic "Other" bucket.
 * Each country carries a default currency that auto-fills the
 * salon's currency so we don't need a separate currency question.
 */
export const COUNTRIES: { code: string; name: string; currency: string }[] = [
  // GCC
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SA", name: "Saudi Arabia",        currency: "SAR" },
  { code: "KW", name: "Kuwait",              currency: "KWD" },
  { code: "BH", name: "Bahrain",             currency: "BHD" },
  { code: "QA", name: "Qatar",               currency: "QAR" },
  { code: "OM", name: "Oman",                currency: "OMR" },
  // MENA neighbors
  { code: "EG", name: "Egypt",               currency: "EGP" },
  { code: "JO", name: "Jordan",              currency: "JOD" },
  { code: "LB", name: "Lebanon",             currency: "LBP" },
  { code: "MA", name: "Morocco",             currency: "MAD" },
  { code: "TN", name: "Tunisia",             currency: "TND" },
  { code: "TR", name: "Türkiye",             currency: "TRY" },
  // Catch-all — defaults to AED, the salon can fix it in Settings
  { code: "OTHER", name: "Other",            currency: "AED" },
];

export function currencyForCountry(countryCode: string): string {
  return COUNTRIES.find((c) => c.code === countryCode)?.currency ?? "AED";
}

// ============================================================
// Business categories
// ============================================================

export const BUSINESS_CATEGORIES: { code: string; name: string }[] = [
  { code: "hair",     name: "Hair salon" },
  { code: "nails",    name: "Nail salon" },
  { code: "spa",      name: "Spa & Massage" },
  { code: "beauty",   name: "Beauty (mixed)" },
  { code: "makeup",   name: "Makeup" },
  { code: "wellness", name: "Wellness" },
  { code: "other",    name: "Other" },
];

// ============================================================
// Team size — the answer here pre-selects the right plan on
// step 4, which is the single biggest conversion lift in the
// wizard.
// ============================================================

export const TEAM_SIZES: {
  code: string;
  name: string;
  suggestedPlan: Plan;
}[] = [
  { code: "just_me", name: "Just me",      suggestedPlan: "solo" },
  { code: "2_3",     name: "2 – 3 people", suggestedPlan: "team" },
  { code: "4_5",     name: "4 – 5 people", suggestedPlan: "team" },
  { code: "6_plus",  name: "6+ people",    suggestedPlan: "multi_team" },
];

export function planForTeamSize(teamSize: string): Plan {
  return TEAM_SIZES.find((t) => t.code === teamSize)?.suggestedPlan ?? "solo";
}

// ============================================================
// Marketing attribution — where they heard about Sukona.
// Skippable in the wizard; lower-priority data.
// ============================================================

export const REFERRAL_SOURCES: { code: string; name: string }[] = [
  { code: "instagram", name: "Instagram" },
  { code: "friend",    name: "A friend" },
  { code: "google",    name: "Google" },
  { code: "whatsapp",  name: "WhatsApp" },
  { code: "youtube",   name: "YouTube" },
  { code: "ai",        name: "AI (ChatGPT, Claude, etc.)" },
  { code: "other",     name: "Other" },
];
