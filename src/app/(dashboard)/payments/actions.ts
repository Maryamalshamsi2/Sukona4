"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/types";

/**
 * 16-char URL-safe token for the public review page.
 * 12 random bytes = 96 bits of entropy — comfortably unguessable.
 */
function generateReviewToken(): string {
  return randomBytes(12).toString("base64url");
}

// Record a payment against an appointment.
// Caller should then transition the appointment status to 'paid'.
//
// Side effect — two tokens are minted (idempotently) at this point:
//   1. review_token  → unlocks the "Send review link" button.
//   2. receipt_token + receipt_number  → unlocks the "Send receipt"
//      button + powers the public /receipt/[token] page.
// We mint here (rather than on the status transition) because "payment
// recorded" is the strongest signal that the visit was completed.
export async function recordPayment(
  appointmentId: string,
  amount: number,
  method: PaymentMethod,
  note: string | null,
  receiptUrl: string | null
) {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    appointment_id: appointmentId,
    amount,
    method,
    note,
    receipt_url: receiptUrl,
  });
  if (error) return { error: error.message };

  // Generate review token (idempotent — only sets if not already present).
  const { data: existing } = await supabase
    .from("appointments")
    .select("review_token")
    .eq("id", appointmentId)
    .single();

  if (existing && !existing.review_token) {
    await supabase
      .from("appointments")
      .update({ review_token: generateReviewToken() })
      .eq("id", appointmentId);
  }

  // Mint receipt token + number atomically. The RPC is idempotent —
  // re-calling for an appointment that already has a token returns the
  // existing values without bumping the counter, so deposit + balance
  // payments share one receipt.
  await supabase.rpc("mint_receipt_for_appointment", {
    p_appointment_id: appointmentId,
  });

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
  receiptUrl: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .update({
      amount,
      method,
      note,
      receipt_url: receiptUrl,
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
  if (file.size > 10 * 1024 * 1024) return { error: "File must be under 10 MB" };
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
