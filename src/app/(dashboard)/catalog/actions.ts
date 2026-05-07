"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---- CATEGORIES ----

export async function getCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addCategory(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("service_categories").insert({
    name: formData.get("name") as string,
  });

  if (error) return { error: error.message };
  revalidatePath("/catalog");
  return { success: true };
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("service_categories")
    .update({ name: formData.get("name") as string })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/catalog");
  return { success: true };
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("service_categories").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/catalog");
  return { success: true };
}

// ---- SERVICES ----

export async function getServices() {
  const supabase = await createClient();
  // Sort by category sort_order first (so categories group together in
  // the All view in the order the owner set), then by service sort_order
  // within each category. Categories tab uses the same field; the All
  // view inherits the ordering automatically.
  const { data, error } = await supabase
    .from("services")
    .select("*, service_categories(*)")
    .order("sort_order", { ascending: true, referencedTable: "service_categories", nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addService(formData: FormData) {
  const supabase = await createClient();

  const categoryId = formData.get("category_id") as string;

  // New services slot in at the bottom of their category. We compute
  // MAX(sort_order)+1 within the same category (or null-category) so
  // existing positions don't get reshuffled.
  const { data: maxRow } = await supabase
    .from("services")
    .select("sort_order")
    .eq("category_id", categoryId || null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("services").insert({
    name: formData.get("name") as string,
    price: parseFloat(formData.get("price") as string) || 0,
    duration_minutes: parseInt(formData.get("duration_minutes") as string) || 60,
    category_id: categoryId || null,
    sort_order: nextOrder,
  });

  if (error) return { error: error.message };
  revalidatePath("/catalog");
  return { success: true };
}

export async function updateService(id: string, formData: FormData) {
  const supabase = await createClient();

  const categoryId = formData.get("category_id") as string;

  const { error } = await supabase
    .from("services")
    .update({
      name: formData.get("name") as string,
      price: parseFloat(formData.get("price") as string) || 0,
      duration_minutes: parseInt(formData.get("duration_minutes") as string) || 60,
      is_active: formData.get("is_active") === "true",
      category_id: categoryId || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/catalog");
  return { success: true };
}

export async function deleteService(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/catalog");
  return { success: true };
}

// ---- BUNDLES ----

export async function getBundles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_bundles")
    .select("*, service_categories(*), service_bundle_items(*, services(*))")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addBundle(
  name: string,
  categoryId: string | null,
  discountType: "percentage" | "fixed",
  discountPercentage: number | null,
  fixedPrice: number | null,
  durationOverride: number | null,
  serviceIds: string[]
) {
  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("service_bundles")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: bundle, error } = await supabase
    .from("service_bundles")
    .insert({
      name,
      category_id: categoryId,
      discount_type: discountType,
      discount_percentage: discountPercentage,
      fixed_price: fixedPrice,
      duration_override: durationOverride,
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const items = serviceIds.map((sid, idx) => ({
    bundle_id: bundle.id,
    service_id: sid,
    sort_order: idx,
  }));

  const { error: itemError } = await supabase
    .from("service_bundle_items")
    .insert(items);

  if (itemError) return { error: itemError.message };

  revalidatePath("/catalog");
  return { success: true };
}

export async function updateBundle(
  id: string,
  name: string,
  categoryId: string | null,
  discountType: "percentage" | "fixed",
  discountPercentage: number | null,
  fixedPrice: number | null,
  durationOverride: number | null,
  isActive: boolean,
  serviceIds: string[]
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("service_bundles")
    .update({
      name,
      category_id: categoryId,
      discount_type: discountType,
      discount_percentage: discountPercentage,
      fixed_price: fixedPrice,
      duration_override: durationOverride,
      is_active: isActive,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Replace items: delete all then re-insert
  await supabase.from("service_bundle_items").delete().eq("bundle_id", id);

  const items = serviceIds.map((sid, idx) => ({
    bundle_id: id,
    service_id: sid,
    sort_order: idx,
  }));

  const { error: itemError } = await supabase
    .from("service_bundle_items")
    .insert(items);

  if (itemError) return { error: itemError.message };

  revalidatePath("/catalog");
  return { success: true };
}

export async function deleteBundle(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("service_bundles").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/catalog");
  return { success: true };
}

// ---- REORDER ----
//
// One server action per kind. Each takes the new ordering as an array of
// IDs and writes back a fresh sort_order matching the index. We can't
// use upsert here because the INSERT path would require all NOT NULL
// columns. Parallel updates keep the round-trip count low (one per row,
// fired together) and the existing RLS "manage" policies gate write
// access to owner/admin only.

async function applyOrdering(table: "services" | "service_bundles" | "service_categories", orderedIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from(table).update({ sort_order: idx }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/catalog");
  return { success: true };
}

export async function reorderServices(orderedIds: string[]) {
  return applyOrdering("services", orderedIds);
}

export async function reorderBundles(orderedIds: string[]) {
  return applyOrdering("service_bundles", orderedIds);
}

export async function reorderCategories(orderedIds: string[]) {
  return applyOrdering("service_categories", orderedIds);
}
