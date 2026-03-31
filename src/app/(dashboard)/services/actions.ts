"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getServices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function addService(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("services").insert({
    name: formData.get("name") as string,
    price: parseFloat(formData.get("price") as string) || 0,
    duration_minutes: parseInt(formData.get("duration_minutes") as string) || 60,
  });

  if (error) return { error: error.message };
  revalidatePath("/services");
  return { success: true };
}

export async function updateService(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("services")
    .update({
      name: formData.get("name") as string,
      price: parseFloat(formData.get("price") as string) || 0,
      duration_minutes: parseInt(formData.get("duration_minutes") as string) || 60,
      is_active: formData.get("is_active") === "true",
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/services");
  return { success: true };
}

export async function deleteService(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/services");
  return { success: true };
}
