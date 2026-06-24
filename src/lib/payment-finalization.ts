import { randomBytes } from "node:crypto";
import type { createClient } from "./supabase/server";

// Auto WhatsApp Cloud API dispatches disabled for v1 — see comment
// in calendar/actions.ts. Staff still share the receipt + review
// link manually via the wa.me deep link in DetailView.

/**
 * Side-effects that fire after a payment row has been inserted for
 * an appointment. Extracted from payments/actions.ts `recordPayment`
 * so the new atomic-redemption server actions (introduced in
 * migration 051) can reuse exactly the same flow:
 *
 *   1. If the appointment isn't already 'paid', flip status to 'paid'.
 *   2. Mint a review_token (idempotent — only when missing).
 *   3. Background: mint receipt_token + receipt_number via RPC.
 *   4. On a real status transition (not a no-op edit): write the
 *      activity_log row and dispatch the WhatsApp "payment paid"
 *      template. Skipped when the appointment was already paid.
 *
 * All four are idempotent or write-once, so re-running them on a
 * partial failure doesn't double-count anything. The point is to
 * keep the redemption + payment INSERT (the dangerous race) atomic
 * via the migration-051 RPCs; these post-payment side effects can
 * stay outside the transaction safely.
 *
 * Returns `{ error }` only when the status flip itself fails — the
 * background work errors are logged but never surfaced.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function generateReviewToken(): string {
  return randomBytes(12).toString("base64url");
}

export async function finalizeAppointmentAfterPayment(
  supabase: SupabaseServerClient,
  appointmentId: string,
): Promise<{ success?: true; error?: string }> {
  const { data: current } = await supabase
    .from("appointments")
    .select("status, review_token, client_id")
    .eq("id", appointmentId)
    .single();

  const shouldFlipPaid = current && current.status !== "paid";
  const needsReviewToken = current && !current.review_token;

  if (shouldFlipPaid || needsReviewToken) {
    const patch: { status?: string; review_token?: string } = {};
    if (shouldFlipPaid) patch.status = "paid";
    if (needsReviewToken) patch.review_token = generateReviewToken();
    const { error: updErr } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", appointmentId);
    if (updErr) {
      return {
        error: `Payment saved but status flip failed: ${updErr.message}`,
      };
    }
  }

  // Background: receipt token mint (idempotent — the RPC reuses any
  // existing token instead of bumping the counter).
  void (async () => {
    try {
      await supabase.rpc("mint_receipt_for_appointment", {
        p_appointment_id: appointmentId,
      });
    } catch (err) {
      console.error("[finalizePayment] background mint_receipt failed:", err);
    }
  })();

  // Activity log + WhatsApp — only on a real status transition. An
  // edit-payment that doesn't change the status shouldn't double-log
  // or re-notify the customer.
  if (shouldFlipPaid) {
    void (async () => {
      try {
        const { data: client } = current?.client_id
          ? await supabase
              .from("clients")
              .select("name")
              .eq("id", current.client_id)
              .single()
          : { data: null };
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("activity_log").insert({
          appointment_id: appointmentId,
          action: "status_updated",
          description: `Status · ${client?.name || "Unknown"} → paid`,
          old_value: current?.status,
          new_value: "paid",
          performed_by: user?.id || null,
        });
      } catch (err) {
        console.error("[finalizePayment] background activity log failed:", err);
      }
    })();
    // Auto WhatsApp "payment paid" disabled for v1 — staff shares
    // the receipt + review link manually via the wa.me button in
    // DetailView. To re-enable: import dispatchPaymentPaid above
    // and add `void dispatchPaymentPaid(appointmentId);` here.
  }

  return { success: true };
}
