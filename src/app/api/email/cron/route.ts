import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchTrialReminder } from "@/lib/email/dispatch";

/**
 * GET /api/email/cron
 *
 * Daily-fired endpoint that walks the salons table and sends trial
 * reminder emails to owners whose trial_ends_at falls into one of
 * the three windows we care about:
 *
 *   - trial_3d    — exactly 3 days from now (±12h slack)
 *   - trial_1d    — exactly 1 day  from now (±12h slack)
 *   - trial_ended — trial_ends_at is already in the past, and the
 *                   salon never moved out of subscription_status
 *                   'trialing' (i.e. they didn't subscribe)
 *
 * Idempotency: sendEmail() short-circuits when email_send_log has a
 * 'sent' row for (salon_id, email_type). So running this cron twice
 * in a day, or running it after a partial failure, is safe and
 * cheap — the second invocation just finds nothing new to do.
 *
 * Exempt salons (is_exempt = true — founder / demo accounts) are
 * skipped entirely. They live outside the billing lifecycle and
 * shouldn't get trial nags.
 *
 * Auth: protected by a shared `CRON_SECRET`. Vercel Cron sends it in
 * the Authorization header as `Bearer <secret>`. Any caller without
 * the matching secret gets 401. Without this anyone could fire the
 * email-sending endpoint from a browser.
 *
 * Schedule: see vercel.json. Once a day is enough — the windows are
 * ±12h so a daily run hits each salon at most once per phase.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Window widths in hours. With a daily cron tick, we want each salon
// caught by exactly one of the 3d / 1d windows on the day it crosses
// that threshold — a 24h window centered on the boundary gives us
// that with no double-coverage.
const WINDOW_HOURS = 12;

interface RunSummary {
  ok: true;
  scanned: number;
  sent: {
    trial_3d: number;
    trial_1d: number;
    trial_ended: number;
  };
  skipped: number;
  failed: number;
  errors: string[];
}

export async function GET(req: NextRequest) {
  // ---- Auth ----
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ---- Pull every candidate salon ----
  // We could write three separate WHERE clauses (one per window),
  // but the trial population is small (< a few thousand for a long
  // time) and one fetch + JS-side bucketing is simpler to reason
  // about than three SQL queries with overlapping conditions.
  //
  // Filters applied at the DB:
  //   - is_exempt = false           (skip founder / demo)
  //   - trial_ends_at IS NOT NULL   (no trial set → nothing to remind about)
  //   - subscription_status = 'trialing'  (already paying users don't need trial nags)
  const { data: salons, error } = await supabase
    .from("salons")
    .select("id, trial_ends_at, subscription_status")
    .eq("is_exempt", false)
    .eq("subscription_status", "trialing")
    .not("trial_ends_at", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary: RunSummary = {
    ok: true,
    scanned: salons?.length ?? 0,
    sent: { trial_3d: 0, trial_1d: 0, trial_ended: 0 },
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const windowMs = WINDOW_HOURS * HOUR_MS;

  // We send in series. Resend handles parallel fine but the
  // population is small and serialising makes the summary count
  // exact (no races on the counters). If this ever becomes a
  // bottleneck (>500 salons in trial), batch with Promise.all in
  // chunks of 20.
  for (const s of salons ?? []) {
    const endMs = new Date(s.trial_ends_at as string).getTime();
    const diff = endMs - now; // ms until trial ends (negative if past)

    let kind: "3d" | "1d" | "ended" | null = null;
    if (diff < 0) {
      kind = "ended";
    } else if (Math.abs(diff - 1 * 24 * HOUR_MS) <= windowMs) {
      kind = "1d";
    } else if (Math.abs(diff - 3 * 24 * HOUR_MS) <= windowMs) {
      kind = "3d";
    }

    if (!kind) {
      summary.skipped += 1;
      continue;
    }

    try {
      const res = await dispatchTrialReminder(s.id, kind);
      if (res.alreadySent) {
        summary.skipped += 1;
        continue;
      }
      if (res.ok) {
        if (kind === "3d") summary.sent.trial_3d += 1;
        else if (kind === "1d") summary.sent.trial_1d += 1;
        else summary.sent.trial_ended += 1;
      } else {
        summary.failed += 1;
        if (res.errorMessage) {
          summary.errors.push(`${s.id} (${kind}): ${res.errorMessage}`);
        }
      }
    } catch (err) {
      summary.failed += 1;
      summary.errors.push(
        `${s.id} (${kind}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json(summary);
}
