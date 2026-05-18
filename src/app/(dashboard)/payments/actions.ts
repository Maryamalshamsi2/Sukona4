"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
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
  receiptUrls: string[]
) {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    appointment_id: appointmentId,
    amount,
    method,
    note,
    receipt_urls: receiptUrls,
    receipt_url: receiptUrls[0] ?? null,
  });
  if (error) return { error: error.message };

  // Snapshot current state — need status (to know whether we're
  // flipping or already paid), review_token (to skip minting if
  // already set), and client_id (for the activity log message).
  const { data: current } = await supabase
    .from("appointments")
    .select("status, review_token, client_id")
    .eq("id", appointmentId)
    .single();

  const shouldFlipPaid = current && current.status !== "paid";
  const needsReviewToken = current && !current.review_token;

  // Single UPDATE carrying both changes (when applicable). Avoids
  // two round-trips when both are needed.
  if (shouldFlipPaid || needsReviewToken) {
    const patch: { status?: string; review_token?: string } = {};
    if (shouldFlipPaid) patch.status = "paid";
    if (needsReviewToken) patch.review_token = generateReviewToken();
    const { error: updErr } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", appointmentId);
    if (updErr) {
      // Payment was already inserted; bubble up so the UI shows the
      // user that "save partially failed" rather than pretending it
      // succeeded. With migration-036 in place this should be rare —
      // it's defensive against future RLS regressions.
      return { error: `Payment saved but status flip failed: ${updErr.message}` };
    }
  }

  // Mint receipt token + number atomically. The RPC is idempotent —
  // re-calling for an appointment that already has a token returns the
  // existing values without bumping the counter, so deposit + balance
  // payments share one receipt.
  await supabase.rpc("mint_receipt_for_appointment", {
    p_appointment_id: appointmentId,
  });

  // Log + notify — only when the status actually transitioned.
  // updatePayment (the edit-existing-payment path) re-calls this
  // function shape but with an already-paid appointment, in which
  // case we don't want to double-log or double-notify.
  if (shouldFlipPaid) {
    const { data: client } = current?.client_id
      ? await supabase.from("clients").select("name").eq("id", current.client_id).single()
      : { data: null };
    await logActivity(
      supabase,
      appointmentId,
      "status_updated",
      `Status · ${client?.name || "Unknown"} → paid`,
      current?.status,
      "paid",
    );
    void dispatchPaymentPaid(appointmentId);
  }

  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/calendar");
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
) {
  const supabase = await createClient();
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
    })
    .eq("id", paymentId);

  if (error) return { error: error.message };

  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/calendar");
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
