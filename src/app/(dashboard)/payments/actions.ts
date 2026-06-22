"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { finalizeAppointmentAfterPayment } from "@/lib/payment-finalization";
import type { PaymentMethod } from "@/types";

// Record a payment against an appointment.
//
// Two-step flow:
//   1. INSERT the payment row.
//   2. Run finalizeAppointmentAfterPayment (status flip → 'paid',
//      mint review_token, background receipt mint + activity log +
//      WhatsApp dispatch). Shared with the atomic redemption RPCs
//      in migration-051 so the side-effect logic lives in one place.
//
// The status flip is awaited (callers need to know if it failed);
// receipt mint / activity log / WhatsApp run in the background.
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

  const { error: insertErr } = await supabase.from("payments").insert({
    appointment_id: appointmentId,
    amount,
    method,
    note,
    receipt_urls: receiptUrls,
    receipt_url: receiptUrls[0] ?? null,
    tip_amount: tipAmount,
    tip_to_staff_id: tipToStaffId,
  });
  if (insertErr) return { error: insertErr.message };

  const finalize = await finalizeAppointmentAfterPayment(supabase, appointmentId);
  if (finalize.error) return { error: finalize.error };

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
