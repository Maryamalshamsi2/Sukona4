import { createClient } from "@/lib/supabase/server";

/**
 * Server-side helper to fetch the current user's salon currency.
 * Used by server actions / RSCs that need to format amounts (e.g.
 * activity-log notification descriptions, the public receipt page,
 * WhatsApp templates).
 *
 * Falls back to "AED" if anything fails — keeps the app from breaking
 * when the user isn't loaded yet (rare edge case).
 */
export async function getCurrentSalonCurrency(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "AED";

    const { data } = await supabase
      .from("profiles")
      .select("salon:salon_id ( currency )")
      .eq("id", user.id)
      .single<{ salon: { currency: string } | { currency: string }[] | null }>();

    if (!data?.salon) return "AED";
    // PostgREST may return a nested row as either an object or a
    // single-element array depending on relationship inference.
    const salonRow = Array.isArray(data.salon) ? data.salon[0] : data.salon;
    return salonRow?.currency || "AED";
  } catch {
    return "AED";
  }
}
