"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { isSupportedCurrency } from "@/lib/currency";

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
 * Save the salon name and flip is_onboarded to true. Only the owner
 * of a salon can complete onboarding. Returns { success } or { error }.
 */
export async function completeOnboarding(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.role !== "owner") {
    return { error: "Only the salon owner can complete onboarding" };
  }

  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return { error: "Please enter a salon name" };
  if (name.length > 80) return { error: "Salon name is too long" };

  const currency = ((formData.get("currency") as string) || "AED").trim();
  if (!isSupportedCurrency(currency)) return { error: "Unsupported currency" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("salons")
    .update({
      name,
      currency,
      is_onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.salon_id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
