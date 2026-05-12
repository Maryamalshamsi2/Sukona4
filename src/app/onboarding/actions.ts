"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { isSupportedCurrency } from "@/lib/currency";
import {
  BUSINESS_CATEGORIES,
  COUNTRIES,
  REFERRAL_SOURCES,
  TEAM_SIZES,
} from "@/lib/onboarding-options";

/**
 * Fetch the current user's salon (used by the onboarding page to
 * pre-populate the salon-name field and to gate access).
 */
export async function getCurrentSalon() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const { data, error } = await supabase
    .from("salons")
    .select("id, name, is_onboarded, owner_id, currency")
    .eq("id", profile.salon_id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Save the full wizard payload and flip is_onboarded to true. Only
 * the owner of a salon can complete onboarding.
 *
 * Required fields: name, country, category, team_size, plan,
 * billing_period.
 * Optional fields: website, referral_source.
 *
 * The whitelisted code values come from src/lib/onboarding-options.ts
 * — we re-validate server-side so a tampered client can't write
 * arbitrary strings into the salons row.
 */
export async function completeOnboarding(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.role !== "owner") {
    return { error: "Only the salon owner can complete onboarding" };
  }

  // --- Required: business name --------------------------------
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return { error: "Please enter a business name" };
  if (name.length > 80) return { error: "Business name is too long" };

  // --- Optional: website --------------------------------------
  const website = ((formData.get("website") as string) || "").trim();
  if (website.length > 200) return { error: "Website URL is too long" };

  // --- Required: country (whitelisted) ------------------------
  const country = ((formData.get("country") as string) || "").trim();
  if (!COUNTRIES.some((c) => c.code === country)) {
    return { error: "Please pick a country" };
  }

  // --- Required: currency (matches country, double-checked) ---
  const currency = ((formData.get("currency") as string) || "AED").trim();
  if (!isSupportedCurrency(currency)) return { error: "Unsupported currency" };

  // --- Required: category (whitelisted) -----------------------
  const category = ((formData.get("category") as string) || "").trim();
  if (!BUSINESS_CATEGORIES.some((c) => c.code === category)) {
    return { error: "Please pick a business category" };
  }

  // --- Required: team_size (whitelisted) ----------------------
  const teamSize = ((formData.get("team_size") as string) || "").trim();
  if (!TEAM_SIZES.some((t) => t.code === teamSize)) {
    return { error: "Please pick your team size" };
  }

  // --- Required: plan (whitelisted) ---------------------------
  const plan = ((formData.get("plan") as string) || "").trim();
  if (!["solo", "team", "multi_team"].includes(plan)) {
    return { error: "Please pick a plan" };
  }

  // --- Required: billing_period (whitelisted) -----------------
  const billingPeriod = ((formData.get("billing_period") as string) || "").trim();
  if (!["monthly", "annual"].includes(billingPeriod)) {
    return { error: "Please pick a billing period" };
  }

  // --- Optional: referral_source (whitelisted if present) -----
  const referralSourceRaw = ((formData.get("referral_source") as string) || "").trim();
  const referralSource =
    referralSourceRaw && REFERRAL_SOURCES.some((r) => r.code === referralSourceRaw)
      ? referralSourceRaw
      : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("salons")
    .update({
      name,
      website: website || null,
      country,
      currency,
      category,
      team_size: teamSize,
      plan,
      billing_period: billingPeriod,
      referral_source: referralSource,
      is_onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.salon_id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
