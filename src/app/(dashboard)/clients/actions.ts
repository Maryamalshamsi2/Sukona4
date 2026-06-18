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

  const address = (formData.get("address") as string) || null;
  const mapLink = (formData.get("map_link") as string) || null;

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      name: formData.get("name") as string,
      phone: (formData.get("phone") as string) || null,
      address,
      map_link: mapLink,
      notes: (formData.get("notes") as string) || null,
    })
    .select("id")
    .single();

  if (error || !client) return { error: error?.message ?? "Failed to add client" };

  // Migration-047: if an address or map link was provided, also
  // create the client's first saved location (label "Home",
  // default). Fire-and-forget — failure here only means the picker
  // shows nothing until the next manual add; the legacy columns
  // still hold the value for backward-compat reads.
  if (address || mapLink) {
    void supabase
      .from("client_locations")
      .insert({
        client_id: client.id,
        label: "Home",
        address,
        map_link: mapLink,
        is_default: true,
      });
  }

  revalidatePath("/clients");
  return { success: true };
}

export async function updateClient(id: string, formData: FormData) {
  const supabase = await createClient();

  const address = (formData.get("address") as string) || null;
  const mapLink = (formData.get("map_link") as string) || null;

  const { error } = await supabase
    .from("clients")
    .update({
      name: formData.get("name") as string,
      phone: (formData.get("phone") as string) || null,
      address,
      map_link: mapLink,
      notes: (formData.get("notes") as string) || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Migration-047: keep the default saved location in sync with the
  // legacy single-address edit form. Until Phase 3 lands the proper
  // locations UI on /clients, owners still edit address here — the
  // value needs to propagate to client_locations or the appointment-
  // form picker shows stale data.
  void (async () => {
    const { data: defaultLoc } = await supabase
      .from("client_locations")
      .select("id")
      .eq("client_id", id)
      .eq("is_default", true)
      .maybeSingle();
    if (defaultLoc) {
      // Existing default — patch its address/map_link.
      await supabase
        .from("client_locations")
        .update({ address, map_link: mapLink })
        .eq("id", defaultLoc.id);
    } else if (address || mapLink) {
      // No default yet (client originally created without an
      // address, now getting one). Create the first location.
      await supabase.from("client_locations").insert({
        client_id: id,
        label: "Home",
        address,
        map_link: mapLink,
        is_default: true,
      });
    }
  })();

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
