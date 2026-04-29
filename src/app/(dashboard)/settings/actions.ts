"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";

export async function getProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, job_title, role")
    .eq("id", user.id)
    .single();

  return { ...data, email: user.email };
}

export async function updateProfile(fullName: string, phone: string, jobTitle: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: phone || null,
      job_title: jobTitle || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { success: true };
}

export async function getBusinessSettings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check if user is owner
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "owner") return null;

  const { data } = await supabase
    .from("business_settings")
    .select("*")
    .limit(1)
    .single();

  return data;
}

// ---- SALON SETTINGS (owner-only writes) ----

/**
 * Fetch the current user's salon. Any authenticated salon member can
 * read; the form below only renders for owners (RLS would also block
 * non-owner writes, but we gate in the action for clear errors).
 */
export async function getSalon() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salons")
    .select(
      "id, name, slug, brand_color, contact_phone, public_review_url, signoff, default_language, vat_percent, vat_trn, is_onboarded"
    )
    .eq("id", profile.salon_id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Update salon-level branding/contact fields. Only the owner of the
 * salon can call this — RLS enforces it too, but we short-circuit here
 * with a friendly error.
 */
export async function updateSalon(input: {
  name: string;
  brand_color: string | null;
  contact_phone: string | null;
  public_review_url: string | null;
  signoff: string | null;
  default_language: string;
  vat_percent: number;
  vat_trn: string | null;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.role !== "owner") {
    return { error: "Only the salon owner can edit salon settings" };
  }

  const name = input.name.trim();
  if (!name) return { error: "Salon name is required" };
  if (name.length > 80) return { error: "Salon name is too long (max 80)" };

  // VAT validation — bounds match the DB check constraint.
  const vatPercent = Number(input.vat_percent);
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100) {
    return { error: "VAT must be between 0 and 100" };
  }
  // If VAT is charged, TRN is legally required (UAE).
  const trnTrimmed = (input.vat_trn || "").trim();
  if (vatPercent > 0 && !trnTrimmed) {
    return { error: "TRN is required when VAT is charged" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("salons")
    .update({
      name,
      brand_color: input.brand_color || null,
      contact_phone: input.contact_phone || null,
      public_review_url: input.public_review_url || null,
      signoff: input.signoff || null,
      default_language: input.default_language || "en",
      vat_percent: vatPercent,
      vat_trn: trnTrimmed || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.salon_id);

  if (error) return { error: error.message };

  // The salon name shows up in headers/templates across the app, so
  // bust the layout cache.
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getTeamMembers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, job_title, role")
    .order("full_name");

  if (error) throw error;
  return data;
}
