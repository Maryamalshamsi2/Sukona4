"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { dispatchPaymentPaid } from "@/lib/whatsapp/dispatch";
import type { PaymentMethod } from "@/types";

/**
 * 16-char URL-safe token for the public review page.
 * 12 random bytes = 96 bits of entropy — comfortably unguessable.
 */
function generateReviewToken(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Activity-log helper. Inlined here (rather than imported from
 * calendar/actions.ts) so we don't cross "use server" file boundaries
 * for this small piece of logic; both files own their own copy.
 */
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appointmentId: string,
  action: string,
  description: string,
  oldValue?: string | null,
  newValue?: string | null,
) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("activity_log").insert({
    appointment_id: appointmentId,
    action,
    description,
    old_value: oldValue || null,
    new_value: newValue || null,
    performed_by: user?.id || null,
  });
}

// Record a payment against an appointment.
//
// Atomic side effects, all done here in one server call so the
// payment and the "paid" status never get out of sync:
//   1. Insert the payment row (amount, method, note, receipt urls).
//   2. Flip appointment.status → 'paid' (if not already).
//   3. Mint review_token (idempotent — only if missing).
//   4. Mint receipt_token + receipt_number via RPC (idempotent).
//   5. Log a status_updated activity entry for the transition.
//   6. Fire the WhatsApp "payment received" notification (async).
//
// Previously the client had to call updateAppointmentStatus after
// recordPayment, which created a race where the payment could
// succeed but the status flip failed (e.g., RLS denying the
// UPDATE for non-assigned staff), leaving the row stuck as
// "scheduled" with an orphan payment attached.
export async function recordPayment(
  appointmentId: string,
  amount: number,
  method: PaymentMethod,
  note: string | null,
  /** Zero or more uploaded receipt URLs. The first one (if any) is also
   *  written to the legacy `receipt_url` column for backwards compat
   *  with code paths that haven't been migrated to read the array yet. */
  receiptUrls: string[],
  /** Tip amount in salon currency. Defaults to 0 — recorded against
   *  this payment row, surfaced in /payroll. */
  tipAmount: number = 0,
  /** Optional staff id that the tip is attributed to. NULL means the
   *  payroll calc will split the tip equally across whichever staff
   *  performed services on this appointment. */
  tipToStaffId: string | null = null,
) {
  const supabase = await createClient();

  // Round 1: INSERT payment + SELECT current appointment state.
  // These two operations are independent — running them in parallel
  // halves the round-trip count for this stage from 2 to 1.
  const [insertRes, currentRes] = await Promise.all([
    supabase.from("payments").insert({
      appointment_id: appointmentId,
      amount,
      method,
      note,
      receipt_urls: receiptUrls,
      receipt_url: receiptUrls[0] ?? null,
      tip_amount: tipAmount,
      tip_to_staff_id: tipToStaffId,
    }),
    supabase
      .from("appointments")
      .select("status, review_token, client_id")
      .eq("id", appointmentId)
      .single(),
  ]);

  if (insertRes.error) return { error: insertRes.error.message };
  const current = currentRes.data;
  const shouldFlipPaid = current && current.status !== "paid";
  const needsReviewToken = current && !current.review_token;

  // Round 2: appointment update — this one stays awaited because the
  // user needs to know if the status flip succeeded (everything else
  // below is non-critical and idempotent).
  if (shouldFlipPaid || needsReviewToken) {
    const patch: { status?: string; review_token?: string } = {};
    if (shouldFlipPaid) patch.status = "paid";
    if (needsReviewToken) patch.review_token = generateReviewToken();
    const { error: updErr } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", appointmentId);
    if (updErr) {
      // Payment was already inserted; bubble up so the UI shows
      // "save partially failed" rather than pretending it succeeded.
      // Defensive against future RLS regressions (migration-036
      // makes this rare in normal flow).
      return { error: `Payment saved but status flip failed: ${updErr.message}` };
    }
  }

  // Everything below runs in the background. The serverless function
  // instance lingers long enough that these typically finish before
  // it recycles, but if any of them fails, the user-visible save is
  // already a success — we just lose a receipt token or activity log
  // entry that the next page render will surface (or the next save
  // will re-mint). Trading completeness for ~600ms of latency.
  void (async () => {
    try {
      // Mint receipt token + number. Idempotent — re-calling for an
      // appointment that already has a token returns the existing
      // values without bumping the counter.
      await supabase.rpc("mint_receipt_for_appointment", {
        p_appointment_id: appointmentId,
      });
    } catch (err) {
      console.error("[recordPayment] background mint_receipt failed:", err);
    }
  })();

  // Log + notify — only when the status actually transitioned.
  // updatePayment (the edit-existing-payment path) re-calls this
  // function shape but with an already-paid appointment, in which
  // case we don't want to double-log or double-notify.
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
        await logActivity(
          supabase,
          appointmentId,
          "status_updated",
          `Status · ${client?.name || "Unknown"} → paid`,
          current?.status,
          "paid",
        );
      } catch (err) {
        console.error("[recordPayment] background activity log failed:", err);
      }
    })();
    void dispatchPaymentPaid(appointmentId);
  }

  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/calendar");
  revalidatePath("/payroll");
  revalidatePath("/");
  return { success: true };
}

// Update an existing payment row. Used when an owner/admin needs to fix
// a wrong method (e.g. clicked Cash instead of Card) or change/remove
// the receipt photo after marking the appointment paid.
//
// The appointment's status is NOT touched here — it stays "paid". This
// is purely a record-correction.
export async function updatePayment(
  paymentId: string,
  amount: number,
  method: PaymentMethod,
  note: string | null,
  receiptUrls: string[],
  tipAmount: number = 0,
  tipToStaffId: string | null = null,
) {
  // Owner/admin only — staff shouldn't be able to silently rewrite
  // historical receipts. Mirrors the gate on deletePayment below.
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Fetch existing for tenancy + method-change validation. A bare id
  // update with no fetch would silently no-op on a cross-salon row
  // (RLS hides it), and a method change away from gift_card / package
  // would leave the underlying card balance or package sessions in
  // the wrong state — the redeem path is the only place that
  // bookkeeps those, so changing the method here would mask fraud
  // or break reporting. Block the conversion either way.
  const { data: existing } = await supabase
    .from("payments")
    .select("salon_id, method")
    .eq("id", paymentId)
    .maybeSingle();
  if (!existing || existing.salon_id !== profile.salon_id) {
    return { error: "Payment not found" };
  }
  const wasRedemption =
    existing.method === "gift_card" || existing.method === "package";
  const becomesRedemption = method === "gift_card" || method === "package";
  if (wasRedemption !== becomesRedemption || (wasRedemption && existing.method !== method)) {
    return {
      error:
        "Gift card and package payments can't be converted to another method here. Void the payment and re-record it instead.",
    };
  }

  const { error } = await supabase
    .from("payments")
    .update({
      amount,
      method,
      note,
      receipt_urls: receiptUrls,
      // Keep the legacy single-column in sync with the first array entry
      // so code paths reading `receipt_url` see a consistent value.
      receipt_url: receiptUrls[0] ?? null,
      tip_amount: tipAmount,
      tip_to_staff_id: tipToStaffId,
    })
    .eq("id", paymentId);

  if (error) return { error: error.message };

  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/calendar");
  revalidatePath("/payroll");
  revalidatePath("/");
  return { success: true };
}

// Upload a receipt image to the shared `receipts` storage bucket.
// Returns a public URL, or { error } on failure.
export async function uploadReceipt(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > 5 * 1024 * 1024) return { error: "File must be under 5 MB" };
  if (!file.type.startsWith("image/")) return { error: "Only image files are allowed" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `payments/${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from("receipts").getPublicUrl(path);
  return { url: data.publicUrl };
}

// Full list of payments with joined appointment + client + services.
export async function getPayments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(`
      *,
      appointments (
        id, date, time, status,
        clients ( id, name, phone ),
        appointment_services (
          services ( name, price )
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
