"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";

/**
 * Retail sales actions — owner + admin only at every entry point.
 *
 * Staff don't have RLS visibility (migration-043) AND can't reach
 * these actions through the UI (sidebar hides /sales for them).
 * The role check here is defense-in-depth — a crafted client call
 * still gets rejected.
 *
 * The list/list-for-reports paths also enforce the gate so a staff
 * member who somehow obtains the action reference can't pull rows.
 */

async function requireOwnerOrAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Not authorized" } as const;
  }
  return { profile };
}

/** List of retail sales (most-recent first). Optionally filtered by
 *  date range. The UI always passes a range matching the page's
 *  filter; omitting it returns the most recent ~unbounded set
 *  (rare — only on the empty-state load). */
export async function getRetailSales(from?: string, to?: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return [];

  const supabase = await createClient();
  let query = supabase
    .from("retail_sales")
    .select(`
      *,
      clients ( id, name ),
      staff:staff_id ( id, full_name )
    `)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (from) query = query.gte("sale_date", from);
  if (to) query = query.lte("sale_date", to);

  const { data, error } = await query;
  if (error) {
    // Don't throw — return [] so the page renders an empty list
    // instead of crashing. The error is surfaced via the response
    // shape if the caller cares.
    console.error("getRetailSales failed:", error);
    return [];
  }
  return data ?? [];
}

/**
 * Aggregate retail sales total for a date range — used by Reports'
 * Finance summary so the Revenue line includes retail. Returns 0
 * for any caller without owner/admin access (staff doesn't see
 * retail data at all).
 */
export async function getReportRetailSales(from: string, to: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { total: 0, count: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retail_sales")
    .select("amount")
    .gte("sale_date", from)
    .lte("sale_date", to);

  if (error) {
    console.error("getReportRetailSales failed:", error);
    return { total: 0, count: 0 };
  }
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return { total, count: rows.length };
}

interface SalePayload {
  description: string;
  amount: number;
  method: "cash" | "card" | "other";
  saleDate: string; // YYYY-MM-DD
  clientId: string | null;
  staffId: string | null;
  notes: string | null;
}

function validate(p: SalePayload): string | null {
  if (!p.description.trim()) return "Description is required";
  if (!Number.isFinite(p.amount) || p.amount <= 0) {
    return "Amount must be greater than 0";
  }
  if (!["cash", "card", "other"].includes(p.method)) {
    return "Invalid payment method";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.saleDate)) return "Invalid sale date";
  return null;
}

export async function addRetailSale(payload: SalePayload) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const v = validate(payload);
  if (v) return { error: v };

  const supabase = await createClient();
  const { error } = await supabase.from("retail_sales").insert({
    description: payload.description.trim(),
    amount: payload.amount,
    method: payload.method,
    sale_date: payload.saleDate,
    client_id: payload.clientId,
    staff_id: payload.staffId,
    notes: payload.notes?.trim() || null,
    created_by: gate.profile.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/reports");
  return { success: true };
}

export async function updateRetailSale(id: string, payload: SalePayload) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const v = validate(payload);
  if (v) return { error: v };

  const supabase = await createClient();

  // Defense-in-depth tenancy check + existence confirmation. Without
  // this an update with a foreign id returns "success" (RLS turns a
  // cross-salon row into 0 rows; .update reports no error) and the
  // UI shows the toast as if the change landed.
  const { data: existing } = await supabase
    .from("retail_sales")
    .select("salon_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing || existing.salon_id !== gate.profile.salon_id) {
    return { error: "Sale not found" };
  }

  const { error } = await supabase
    .from("retail_sales")
    .update({
      description: payload.description.trim(),
      amount: payload.amount,
      method: payload.method,
      sale_date: payload.saleDate,
      client_id: payload.clientId,
      staff_id: payload.staffId,
      notes: payload.notes?.trim() || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/reports");
  return { success: true };
}

export async function deleteRetailSale(id: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();

  // Same tenancy fence as updateRetailSale — a 0-row delete would
  // otherwise look like a successful deletion to the caller.
  const { data: existing } = await supabase
    .from("retail_sales")
    .select("salon_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing || existing.salon_id !== gate.profile.salon_id) {
    return { error: "Sale not found" };
  }

  const { error } = await supabase
    .from("retail_sales")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/reports");
  return { success: true };
}
