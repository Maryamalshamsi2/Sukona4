"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();
  return data;
}

export async function getTodayAppointments(date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`
      *,
      clients ( id, name, phone, address ),
      appointment_services (
        id,
        service_id,
        staff_id,
        is_parallel,
        sort_order,
        services:service_id ( id, name, price, duration_minutes )
      )
    `)
    .eq("date", date)
    .neq("status", "cancelled")
    .order("time", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getRecentActivities() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("activity_log")
    .select(`
      id,
      action,
      description,
      old_value,
      new_value,
      created_at,
      performed_by,
      profiles:performed_by ( full_name )
    `)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return data;
}

