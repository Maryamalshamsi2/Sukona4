"use server";

import { createClient } from "@/lib/supabase/server";

async function getCurrentUserRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, role: null };
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, role: data?.role || "staff" };
}

export async function getReportAppointments(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`
      id,
      client_id,
      date,
      time,
      status,
      notes,
      created_at,
      clients ( id, name, phone ),
      appointment_services (
        id,
        service_id,
        staff_id,
        is_parallel,
        sort_order,
        services:service_id ( id, name, price, duration_minutes )
      )
    `)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("time", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getReportPayments(from: string, to: string) {
  const supabase = await createClient();
  // payments join appointments for date filtering
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id,
      appointment_id,
      amount,
      method,
      created_at,
      appointments:appointment_id (
        id,
        date,
        time,
        client_id,
        clients ( id, name )
      )
    `)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getReportExpenses(from: string, to: string) {
  const { supabase, role } = await getCurrentUserRole();

  let query = supabase
    .from("expenses")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  // Staff can only see non-private expenses
  if (role !== "owner") {
    query = query.eq("is_private", false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getStaffMembers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, job_title")
    .eq("role", "staff")
    .order("full_name");

  if (error) throw error;
  return data;
}
