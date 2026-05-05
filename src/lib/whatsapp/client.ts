/**
 * Low-level WhatsApp Cloud API sender.
 *
 * One job: take a salon + template + phone + variables, POST to Meta's
 * Graph API, and write a row to `whatsapp_send_log` (success or failure).
 *
 * Design notes:
 *
 * - Uses the Supabase **service role** for both reading credentials and
 *   writing the log row. The caller (a server action) has already done
 *   the RLS-checked work that decided to send (e.g. created the
 *   appointment), so we trust the `salonId` passed in. Service role lets
 *   a `staff` user trigger an auto-send even though the send_log RLS
 *   only allows owner/admin to write directly.
 *
 * - Returns `{ ok: false, error: 'NOT_CONFIGURED' }` when the salon
 *   hasn't filled in their WABA credentials yet — the caller should
 *   fall back to the wa.me deep link in that case (the existing
 *   ShareSection / staff workflow). This is the v1 default for new
 *   salons that haven't connected a Meta WABA yet.
 *
 * - "Fire and forget" from the caller's perspective: the function is
 *   awaited but failures don't throw — they return `{ ok: false }` so
 *   appointment creation never fails because WhatsApp is down.
 *
 * - We track the API HTTP response status. Read receipts (delivered /
 *   read by the customer) require a webhook subscription and are
 *   deferred to v2.
 */

import { createClient } from "@supabase/supabase-js";
import type { WhatsAppTemplateName } from "@/types";

const META_API_VERSION = "v21.0";

export interface SendTemplateOptions {
  /** Link the send to a specific appointment so the audit log can group by it. */
  appointmentId?: string | null;
  /**
   * When this send is a retry of an earlier failed log row, pass that
   * row's id so the UI can render a "retried from #abc" chain.
   */
  retriedFrom?: string | null;
  /**
   * Language code for the template (must match what was approved in
   * Meta Template Manager). v1 is English-only.
   */
  language?: string;
}

export interface SendTemplateResult {
  ok: boolean;
  /** Short machine-readable error code: NOT_CONFIGURED | API_ERROR | NETWORK_ERROR | INTERNAL */
  error?: string;
  /** Human-readable error message — what we logged to whatsapp_send_log.error_message. */
  errorMessage?: string;
  /** Meta's wamid for the sent message (only on success). */
  meta_message_id?: string;
  /** Row id in whatsapp_send_log (so the caller can show "retry" against it). */
  log_id?: string;
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
 * Send a Meta-approved template to one phone number for a given salon.
 *
 * `variables` is the ordered list of substitutions for {{1}}, {{2}}, ...
 * — the exact same shape we store in `whatsapp_send_log.variables`.
 */
export async function sendTemplate(
  salonId: string,
  templateName: WhatsAppTemplateName,
  toPhone: string,
  variables: string[],
  opts: SendTemplateOptions = {}
): Promise<SendTemplateResult> {
  const supabase = adminClient();
  const language = opts.language ?? "en";

  // 1. Fetch this salon's WABA creds.
  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select(
      "whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id"
    )
    .eq("id", salonId)
    .single();

  if (salonErr || !salon) {
    return {
      ok: false,
      error: "INTERNAL",
      errorMessage: salonErr?.message ?? "Salon not found",
    };
  }

  const phoneNumberId = salon.whatsapp_phone_number_id;
  const accessToken = salon.whatsapp_access_token;

  // 2. If creds aren't set, bail with NOT_CONFIGURED so the caller can
  //    fall back to wa.me. We do *not* write a log row in this case —
  //    a salon that hasn't connected WABA shouldn't have noisy "failed"
  //    rows in their audit log.
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: "NOT_CONFIGURED" };
  }

  // 3. Sanitise the destination. Meta wants digits only — no "+",
  //    spaces, or dashes.
  const to = toPhone.replace(/\D/g, "");
  if (to.length < 7) {
    return await writeFailLog(supabase, {
      salonId,
      appointmentId: opts.appointmentId ?? null,
      templateName,
      recipientPhone: toPhone,
      variables,
      retriedFrom: opts.retriedFrom ?? null,
      errorMessage: `Invalid phone number: ${toPhone}`,
    });
  }

  // 4. Build the Cloud API payload. Each variable becomes a `text`
  //    parameter under the `body` component, in the order the template
  //    expects (which matches our positional {{1}}, {{2}}, ...).
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: variables.map((v) => ({ type: "text", text: v })),
        },
      ],
    },
  };

  // 5. Fire the request.
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
  let httpRes: Response;
  try {
    httpRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return await writeFailLog(supabase, {
      salonId,
      appointmentId: opts.appointmentId ?? null,
      templateName,
      recipientPhone: to,
      variables,
      retriedFrom: opts.retriedFrom ?? null,
      errorMessage: `Network error: ${
        err instanceof Error ? err.message : String(err)
      }`,
      errorCode: "NETWORK_ERROR",
    });
  }

  let json: {
    messages?: Array<{ id: string }>;
    error?: { message?: string; code?: number; error_subcode?: number };
  } = {};
  try {
    json = (await httpRes.json()) as typeof json;
  } catch {
    // body wasn't json — keep going with whatever status we have
  }

  if (!httpRes.ok) {
    const apiMsg =
      json?.error?.message ?? `Meta API returned ${httpRes.status}`;
    return await writeFailLog(supabase, {
      salonId,
      appointmentId: opts.appointmentId ?? null,
      templateName,
      recipientPhone: to,
      variables,
      retriedFrom: opts.retriedFrom ?? null,
      errorMessage: apiMsg,
      errorCode: "API_ERROR",
    });
  }

  const wamid = json.messages?.[0]?.id ?? null;

  // 6. Success — log it.
  const { data: logRow, error: logErr } = await supabase
    .from("whatsapp_send_log")
    .insert({
      salon_id: salonId,
      appointment_id: opts.appointmentId ?? null,
      template_name: templateName,
      recipient_phone: to,
      variables,
      status: "sent",
      meta_message_id: wamid,
      retried_from: opts.retriedFrom ?? null,
    })
    .select("id")
    .single();

  if (logErr) {
    // Send succeeded but logging failed — still report success to the
    // caller, but include the log error so we can debug.
    return {
      ok: true,
      meta_message_id: wamid ?? undefined,
      errorMessage: `Send ok, log insert failed: ${logErr.message}`,
    };
  }

  return {
    ok: true,
    meta_message_id: wamid ?? undefined,
    log_id: logRow?.id,
  };
}

/**
 * Helper: write a 'failed' row and shape the standard error result.
 * Pulled out because we hit it from three different points (bad phone,
 * network error, API rejection).
 */
async function writeFailLog(
  supabase: ReturnType<typeof adminClient>,
  args: {
    salonId: string;
    appointmentId: string | null;
    templateName: string;
    recipientPhone: string;
    variables: string[];
    retriedFrom: string | null;
    errorMessage: string;
    errorCode?: string;
  }
): Promise<SendTemplateResult> {
  const { data: logRow } = await supabase
    .from("whatsapp_send_log")
    .insert({
      salon_id: args.salonId,
      appointment_id: args.appointmentId,
      template_name: args.templateName,
      recipient_phone: args.recipientPhone,
      variables: args.variables,
      status: "failed",
      error_message: args.errorMessage,
      retried_from: args.retriedFrom,
    })
    .select("id")
    .single();

  return {
    ok: false,
    error: args.errorCode ?? "API_ERROR",
    errorMessage: args.errorMessage,
    log_id: logRow?.id,
  };
}
