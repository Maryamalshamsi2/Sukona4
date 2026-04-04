"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase
    .from("inventory")
    .update({ quantity })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/inventory");
  return { success: true };
}
