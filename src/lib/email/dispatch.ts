/**
 * High-level email dispatch — one helper per event.
 *
 * Callers say "this salon just onboarded" or "this salon's trial is
 * 3 days out" and we do the salon+owner SQL fetch, build template
 * variables, and call sendEmail().
 *
 * All dispatchers are fire-and-forget from the caller's view:
 *   - They never throw — failures are logged in email_send_log and
 *     swallowed.
 *   - They short-circuit silently when the owner has no email or
 *     Resend isn't configured.
 *   - The actual API call is async; callers `void` them or `await`
 *     in cron context where we want a final summary.
 *
 * Idempotency is enforced by sendEmail()'s pre-flight check + the
 * partial unique index on email_send_log, so it's safe to call any
 * dispatcher repeatedly (e.g. cron runs daily) without spamming the
 * owner.
 */

"use server";

import { createClient } from "@supabase/supabase-js";
import { sendEmail, type EmailType, type SendEmailResult } from "./client";
import {
  renderWelcome,
  renderTrialReminder,
  renderTrialEnded,
} from "./templates";

/** Service-role client — same pattern as whatsapp/dispatch.ts. */
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function appUrl(): string {
  // Same precedence Stripe checkout uses: explicit env first, then
  // Vercel-injected URL, then localhost. Always normalised to no
  // trailing slash.
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

interface SalonOwnerCtx {
  salonId: string;
  salonName: string;
  ownerEmail: string;
  ownerName: string;
  trialEndsAt: Date | null;
}

/**
 * Look up the salon + its owner's contact info. Returns null when
 * the salon is missing, has no owner_id, or the owner has no email
 * on their profile (rare — every Supabase auth user has one — but
 * we'd rather skip than throw).
 *
 * Excludes is_exempt salons in the cron path — see callers.
 */
async function getSalonOwnerCtx(
  salonId: string
): Promise<SalonOwnerCtx | null> {
  const supabase = adminClient();
  const { data: salon, error } = await supabase
    .from("salons")
    .select("id, name, owner_id, trial_ends_at")
    .eq("id", salonId)
    .single();
  if (error || !salon || !salon.owner_id) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", salon.owner_id)
    .single();
  if (!profile?.email) return null;

  return {
    salonId: salon.id,
    salonName: salon.name || "your business",
    ownerEmail: profile.email,
    ownerName: profile.full_name || "there",
    trialEndsAt: salon.trial_ends_at ? new Date(salon.trial_ends_at) : null,
  };
}

// ---------- Welcome ----------

/**
 * Sent once, right after the owner completes onboarding. Idempotent —
 * a duplicate call (e.g. if the user somehow re-runs completeOnboarding)
 * will short-circuit on the unique 'sent' row.
 */
export async function dispatchWelcomeEmail(
  salonId: string
): Promise<SendEmailResult> {
  const ctx = await getSalonOwnerCtx(salonId);
  if (!ctx) {
    return { ok: false, error: "INTERNAL", errorMessage: "Salon/owner not found" };
  }

  const tpl = renderWelcome({
    ownerName: ctx.ownerName,
    salonName: ctx.salonName,
    appUrl: appUrl(),
  });

  return sendEmail({
    salonId: ctx.salonId,
    emailType: "welcome",
    to: ctx.ownerEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}

// ---------- Trial reminders ----------

/**
 * Trial reminder. `kind` picks which window we're in:
 *   - '3d'    — three days left
 *   - '1d'    — one day left
 *   - 'ended' — trial expired (account is paused)
 *
 * The cron passes us the salon ids already filtered by date window,
 * so this function doesn't re-check the trial timing — it just
 * formats and sends the matching template.
 */
export async function dispatchTrialReminder(
  salonId: string,
  kind: "3d" | "1d" | "ended"
): Promise<SendEmailResult> {
  const ctx = await getSalonOwnerCtx(salonId);
  if (!ctx) {
    return { ok: false, error: "INTERNAL", errorMessage: "Salon/owner not found" };
  }

  let emailType: EmailType;
  let tpl;
  if (kind === "ended") {
    emailType = "trial_ended";
    tpl = renderTrialEnded({
      ownerName: ctx.ownerName,
      salonName: ctx.salonName,
      appUrl: appUrl(),
    });
  } else {
    emailType = kind === "3d" ? "trial_3d" : "trial_1d";
    // 3d/1d both rely on trial_ends_at for the date label. If for
    // some reason it's null, fall back to "soon" rather than aborting.
    if (!ctx.trialEndsAt) {
      return {
        ok: false,
        error: "INTERNAL",
        errorMessage: "Salon has no trial_ends_at",
      };
    }
    tpl = renderTrialReminder({
      ownerName: ctx.ownerName,
      salonName: ctx.salonName,
      daysLeft: kind === "3d" ? 3 : 1,
      trialEndsAt: ctx.trialEndsAt,
      appUrl: appUrl(),
    });
  }

  return sendEmail({
    salonId: ctx.salonId,
    emailType,
    to: ctx.ownerEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}
