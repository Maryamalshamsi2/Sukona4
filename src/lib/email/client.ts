/**
 * Low-level Resend sender.
 *
 * One job: take a salon + email type + recipient + rendered HTML/subject,
 * POST to Resend, and write a row to `email_send_log` (success or
 * failure).
 *
 * Mirror of `lib/whatsapp/client.ts` in shape — different transport,
 * same idea: idempotent, audit-logged, fire-and-forget from the
 * caller's perspective.
 *
 * Design notes:
 *
 * - Uses the Supabase **service role** for log writes. The cron path
 *   has no authenticated user (Vercel Cron calls us with a shared
 *   secret), and the welcome path is called from inside server actions
 *   where we'd rather not wrestle with RLS just to record an audit row.
 *
 * - Idempotency is enforced by the `uniq_email_send_log_sent` partial
 *   unique index on (salon_id, email_type) where status='sent'. If we
 *   try to insert a duplicate 'sent' row, the insert fails with code
 *   23505 — we catch that and return `{ ok: true, alreadySent: true }`
 *   so the cron treats it as a no-op rather than an error.
 *
 * - Failures don't throw. Returns `{ ok: false, error }` so a callable
 *   path (signup, cron) never aborts because email is down.
 *
 * - `RESEND_API_KEY` missing → `{ ok: false, error: 'NOT_CONFIGURED' }`.
 *   Lets us run the rest of the app in environments (local dev,
 *   preview deployments) where Resend isn't wired up without crashing.
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export type EmailType =
  | "welcome"
  | "trial_3d"
  | "trial_1d"
  | "trial_ended";

export interface SendEmailOptions {
  salonId: string;
  emailType: EmailType;
  to: string;
  subject: string;
  html: string;
  /** Optional plaintext fallback. Resend auto-generates one if omitted,
   *  but providing our own keeps the unsubscribe / reply CTA legible
   *  for terminal-style mail clients. */
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Short machine-readable error: NOT_CONFIGURED | API_ERROR | ALREADY_SENT | INTERNAL */
  error?: string;
  /** Human-readable error message — what we logged to email_send_log.error_message. */
  errorMessage?: string;
  /** Resend's message id (only on success). */
  resend_message_id?: string;
  /** True when we no-op'd because a prior 'sent' row already exists. */
  alreadySent?: boolean;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Send one transactional email and atomically record the attempt.
 *
 * Idempotency contract: calling this twice in a row with the same
 * (salonId, emailType) will succeed the first time and short-circuit
 * to `{ ok: true, alreadySent: true }` on the second. Callers don't
 * need to do their own "already sent?" check.
 */
export async function sendEmail(
  opts: SendEmailOptions
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "NOT_CONFIGURED",
      errorMessage:
        "RESEND_API_KEY or EMAIL_FROM not set — email send skipped",
    };
  }

  // Basic recipient sanity check — Resend itself would also reject
  // a bad address, but bailing early avoids burning a quota call.
  const to = opts.to.trim();
  if (!to.includes("@")) {
    return await writeFailLog({
      ...opts,
      errorMessage: `Invalid recipient email: ${opts.to}`,
    });
  }

  // Pre-flight idempotency check. The partial unique index will also
  // catch duplicates atomically at insert time, but querying first
  // saves us a wasted Resend API call when the answer is "already
  // sent." Cron runs this check daily on the same population, so
  // skipping the network round-trip matters.
  const supabase = adminClient();
  const { data: existing } = await supabase
    .from("email_send_log")
    .select("id, resend_message_id")
    .eq("salon_id", opts.salonId)
    .eq("email_type", opts.emailType)
    .eq("status", "sent")
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      alreadySent: true,
      resend_message_id: existing.resend_message_id ?? undefined,
    };
  }

  // Hit Resend.
  const resend = new Resend(apiKey);
  let resendId: string | null = null;
  try {
    const res = await resend.emails.send({
      from,
      to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (res.error) {
      return await writeFailLog({
        ...opts,
        errorMessage: res.error.message ?? "Resend API returned an error",
      });
    }
    resendId = res.data?.id ?? null;
  } catch (err) {
    return await writeFailLog({
      ...opts,
      errorMessage: `Resend network error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  // Log success. If the insert collides on the partial unique index,
  // that means a parallel invocation beat us to it — treat as "already
  // sent" and report success.
  const { error: insErr } = await supabase.from("email_send_log").insert({
    salon_id: opts.salonId,
    email_type: opts.emailType,
    recipient_email: to,
    status: "sent",
    resend_message_id: resendId,
  });

  if (insErr) {
    // Postgres unique violation
    if (insErr.code === "23505") {
      return {
        ok: true,
        alreadySent: true,
        resend_message_id: resendId ?? undefined,
      };
    }
    // Email went out but logging failed — still success from the user's
    // standpoint, but surface the log error for ops visibility.
    return {
      ok: true,
      resend_message_id: resendId ?? undefined,
      errorMessage: `Email sent, log insert failed: ${insErr.message}`,
    };
  }

  return {
    ok: true,
    resend_message_id: resendId ?? undefined,
  };
}

async function writeFailLog(
  args: SendEmailOptions & { errorMessage: string }
): Promise<SendEmailResult> {
  try {
    const supabase = adminClient();
    await supabase.from("email_send_log").insert({
      salon_id: args.salonId,
      email_type: args.emailType,
      recipient_email: args.to,
      status: "failed",
      error_message: args.errorMessage,
    });
  } catch {
    // Logging the failure itself failed — nothing left to do.
  }
  return {
    ok: false,
    error: "API_ERROR",
    errorMessage: args.errorMessage,
  };
}
