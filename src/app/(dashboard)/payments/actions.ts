"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/types";

// Record a payment against an appointment.
// Caller should then transition the appointment status to 'paid'.
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
