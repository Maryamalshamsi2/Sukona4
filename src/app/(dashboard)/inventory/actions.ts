"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Helper to log notification rows. salon_id auto-fills via column default
// (migration 014). performed_by = the actor; the notification bell filters
// out self-actions for these types so the actor isn't notified about their
// own action.
async function logNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | null,
  action: string,
  description: string,
) {
  await supabase.from("activity_log").insert({
    appointment_id: null,
    action,
    description,
    performed_by: userId,
  });
}

export async function getInventoryItems() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createInventoryItem(
  name: string,
  quantity: number,
  lowStockThreshold: number,
  category: string,
  unit: string,
  costPerUnit: number | null,
  notes: string
) {
  const supabase = await createClient();
  const { error } = await supabase.from("inventory").insert({
    name,
    quantity,
    low_stock_threshold: lowStockThreshold,
    category,
    unit,
    cost_per_unit: costPerUnit,
    notes: notes || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/inventory");
  return { success: true };
}

export async function updateInventoryItem(
  id: string,
  name: string,
  quantity: number,
  lowStockThreshold: number,
  category: string,
  unit: string,
  costPerUnit: number | null,
  notes: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // Snapshot the old quantity + name + threshold so we can detect a
  // change worth notifying about and a low-stock threshold crossing.
  const { data: before } = await supabase
    .from("inventory")
    .select("name, quantity, low_stock_threshold")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("inventory")
    .update({
      name,
      quantity,
      low_stock_threshold: lowStockThreshold,
      category,
      unit,
      cost_per_unit: costPerUnit,
      notes: notes || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  if (before && before.quantity !== quantity) {
    // Quantity changed → notify. e.g. "Stock · Gel polish 12 → 10".
    await logNotification(
      supabase,
      userId,
      "inventory_adjusted",
      `Stock · ${before.name} ${before.quantity} → ${quantity}`,
    );
    // Threshold crossing → also fire low-stock notification.
    if (before.quantity > before.low_stock_threshold && quantity <= lowStockThreshold) {
      await logNotification(
        supabase,
        userId,
        "inventory_low_stock",
        `Low stock · ${before.name} (${quantity} left)`,
      );
    }
  }

  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteInventoryItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("inventory").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/inventory");
  return { success: true };
}

export async function updateInventoryQuantity(id: string, quantity: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // Read before so we can describe the change + detect threshold crossing.
  const { data: before } = await supabase
    .from("inventory")
    .select("name, quantity, low_stock_threshold")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("inventory")
    .update({ quantity })
    .eq("id", id);

  if (error) return { error: error.message };

  if (before && before.quantity !== quantity) {
    await logNotification(
      supabase,
      userId,
      "inventory_adjusted",
      `Stock · ${before.name} ${before.quantity} → ${quantity}`,
    );
    if (before.quantity > before.low_stock_threshold && quantity <= before.low_stock_threshold) {
      await logNotification(
        supabase,
        userId,
        "inventory_low_stock",
        `Low stock · ${before.name} (${quantity} left)`,
      );
    }
  }

  revalidatePath("/inventory");
  return { success: true };
}
