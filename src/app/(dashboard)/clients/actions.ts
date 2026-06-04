"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTeamScope } from "@/lib/auth-server";

export async function getClients() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function addClient(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("clients").insert({
    name: formData.get("name") as string,
    phone: (formData.get("phone") as string) || null,
    address: (formData.get("address") as string) || null,
    map_link: (formData.get("map_link") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { success: true };
}

export async function updateClient(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({
      name: formData.get("name") as string,
      phone: (formData.get("phone") as string) || null,
      address: (formData.get("address") as string) || null,
      map_link: (formData.get("map_link") as string) || null,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClient(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { success: true };
}

// Fetch all appointments for a specific client (past + upcoming, including cancelled),
// ordered by date desc, then time desc. Shaped the same as calendar's getAppointmentsForDate
// so it can feed directly into <DetailView> and <AppointmentForm>.
//
// Admin team scoping (Multi-Team v1.5 extension): a scoped admin
// (admin role + group_id set) only sees appointments where at least
// one service was performed by their team. Same rule as the calendar
// / reports / payroll filters. Owner / unscoped admin / staff see
// the unfiltered history.
export async function getClientAppointments(clientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`
      *,
      clients ( id, name, phone, address, map_link ),
      appointment_services (
        id,
        service_id,
        staff_id,
        is_parallel,
        sort_order,
        bundle_id,
        bundle_instance_id,
        bundle_total_price,
        bundle_name,
        services:service_id ( id, name, price, duration_minutes )
      ),
      reviews ( id, rating, comment, submitted_at )
    `)
    .eq("client_id", clientId)
    .order("date", { ascending: false })
    .order("time", { ascending: false });

  if (error) throw error;

  const { teamScope } = await getTeamScope();
  if (!teamScope) return data ?? [];

  const { data: teamStaff } = await supabase
    .from("profiles")
    .select("id")
    .eq("group_id", teamScope);
  const teamStaffIds = new Set((teamStaff ?? []).map((r) => r.id));
  return (data ?? []).filter((appt: { appointment_services?: { staff_id: string | null }[] }) => {
    const svcs = appt.appointment_services ?? [];
    return svcs.some((as) => as.staff_id && teamStaffIds.has(as.staff_id));
  });
}
