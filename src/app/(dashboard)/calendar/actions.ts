"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Helper to log activity
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appointmentId: string | null,
  action: string,
  description: string,
  oldValue?: string | null,
  newValue?: string | null
) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("activity_log").insert({
    appointment_id: appointmentId,
    action,
    description,
    old_value: oldValue || null,
    new_value: newValue || null,
    performed_by: user?.id || null,
  });
}

// ---- LOAD DATA ----

export async function getAppointmentsForDate(date: string) {
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
        services:service_id ( id, name, price, duration_minutes )
      )
    `)
    .eq("date", date)
    .neq("status", "cancelled")
    .order("time", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getStaffMembers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, job_title")
    .eq("role", "staff")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getClients() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, phone, address, map_link")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getServices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes, category_id, service_categories(name)")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getCalendarBlocks(date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_blocks")
    .select("*")
    .eq("date", date)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return data;
}

// ---- ADD NEW CLIENT (inline) ----

export async function addClientQuick(name: string, phone: string, address: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      phone: phone || null,
      address: address || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, client: data };
}

// ---- CREATE APPOINTMENT ----

export interface ServiceEntry {
  service_id: string;
  staff_id: string;
  is_parallel: boolean;
  sort_order?: number;
}

export async function createAppointment(
  clientId: string,
  date: string,
  time: string,
  notes: string,
  serviceEntries: ServiceEntry[]
) {
  const supabase = await createClient();

  if (!clientId || !date || !time) {
    return { error: "Client, date, and time are required" };
  }

  if (serviceEntries.length === 0 || serviceEntries.some((e) => !e.staff_id)) {
    return { error: "Each service must have a staff member assigned" };
  }

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      client_id: clientId,
      service_id: serviceEntries[0]?.service_id || null,
      date,
      time,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Insert appointment_services
  const rows = serviceEntries.map((e, i) => ({
    appointment_id: appointment.id,
    service_id: e.service_id,
    staff_id: e.staff_id,
    is_parallel: i === 0 ? false : e.is_parallel,
    sort_order: i,
  }));

  const { error: svcError } = await supabase
    .from("appointment_services")
    .insert(rows);

  if (svcError) return { error: svcError.message };

  // Also insert into appointment_staff for backwards compat / RLS
  const uniqueStaffIds = [...new Set(serviceEntries.map((e) => e.staff_id))];
  if (uniqueStaffIds.length > 0) {
    const staffRows = uniqueStaffIds.map((sid) => ({
      appointment_id: appointment.id,
      staff_id: sid,
    }));
    await supabase.from("appointment_staff").insert(staffRows);
  }

  // Fetch client name for activity description
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();
  await logActivity(supabase, appointment.id, "created",
    `New appointment for ${client?.name || "Unknown"} on ${date} at ${time}`);

  revalidatePath("/calendar");
  return { success: true };
}

// ---- UPDATE APPOINTMENT ----

export async function updateAppointment(
  id: string,
  clientId: string,
  date: string,
  time: string,
  notes: string,
  serviceEntries: ServiceEntry[]
) {
  const supabase = await createClient();

  if (serviceEntries.length === 0 || serviceEntries.some((e) => !e.staff_id)) {
    return { error: "Each service must have a staff member assigned" };
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      client_id: clientId,
      service_id: serviceEntries[0]?.service_id || null,
      date,
      time,
      notes: notes || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Replace appointment_services
  const { error: delSvcErr } = await supabase.from("appointment_services").delete().eq("appointment_id", id);
  if (delSvcErr) return { error: `Delete services: ${delSvcErr.message}` };

  const rows = serviceEntries.map((e, i) => ({
    appointment_id: id,
    service_id: e.service_id,
    staff_id: e.staff_id,
    is_parallel: i === 0 ? false : e.is_parallel,
    sort_order: i,
  }));
  const { error: insSvcErr } = await supabase.from("appointment_services").insert(rows);
  if (insSvcErr) return { error: `Insert services: ${insSvcErr.message}` };

  // Replace appointment_staff
  const { error: delStaffErr } = await supabase.from("appointment_staff").delete().eq("appointment_id", id);
  if (delStaffErr) return { error: `Delete staff: ${delStaffErr.message}` };

  const uniqueStaffIds = [...new Set(serviceEntries.map((e) => e.staff_id))];
  if (uniqueStaffIds.length > 0) {
    const staffRows = uniqueStaffIds.map((sid) => ({
      appointment_id: id,
      staff_id: sid,
    }));
    const { error: insStaffErr } = await supabase.from("appointment_staff").insert(staffRows);
    if (insStaffErr) return { error: `Insert staff: ${insStaffErr.message}` };
  }

  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();
  await logActivity(supabase, id, "edited",
    `Appointment for ${client?.name || "Unknown"} was edited`);

  revalidatePath("/calendar");
  return { success: true };
}

// ---- UPDATE STATUS ----

export async function updateAppointmentStatus(id: string, status: string) {
  const supabase = await createClient();
  // Get current status before updating
  const { data: current } = await supabase.from("appointments").select("status, client_id").eq("id", id).single();
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  const { data: client } = current?.client_id
    ? await supabase.from("clients").select("name").eq("id", current.client_id).single()
    : { data: null };
  await logActivity(supabase, id, "status_updated",
    `${client?.name || "Unknown"}'s appointment status changed to ${status.replace(/_/g, " ")}`,
    current?.status, status);

  revalidatePath("/calendar");
  return { success: true };
}

// ---- CANCEL ----

export async function cancelAppointment(id: string) {
  const supabase = await createClient();
  const { data: current } = await supabase.from("appointments").select("client_id").eq("id", id).single();
  const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: error.message };

  const { data: client } = current?.client_id
    ? await supabase.from("clients").select("name").eq("id", current.client_id).single()
    : { data: null };
  await logActivity(supabase, id, "cancelled",
    `${client?.name || "Unknown"}'s appointment was cancelled`);

  revalidatePath("/calendar");
  return { success: true };
}

// ---- DRAG: UPDATE TIME ----

export async function updateAppointmentTime(id: string, newTime: string) {
  const supabase = await createClient();
  const { data: current } = await supabase.from("appointments").select("time, client_id").eq("id", id).single();
  const { error } = await supabase.from("appointments").update({ time: newTime }).eq("id", id);
  if (error) return { error: error.message };

  const { data: client } = current?.client_id
    ? await supabase.from("clients").select("name").eq("id", current.client_id).single()
    : { data: null };
  await logActivity(supabase, id, "time_changed",
    `${client?.name || "Unknown"}'s appointment time changed to ${newTime}`,
    current?.time, newTime);

  revalidatePath("/calendar");
  return { success: true };
}

// ---- RESIZE: UPDATE DURATION ----

export async function updateAppointmentDuration(id: string, durationMinutes: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ duration_override: durationMinutes }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { success: true };
}

// ---- CALENDAR BLOCKS ----

export async function createCalendarBlock(
  staffId: string, date: string, startTime: string,
  endTime: string, title: string, blockType: string
) {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_blocks").insert({
    staff_id: staffId, date, start_time: startTime,
    end_time: endTime, title, block_type: blockType,
  });
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { success: true };
}

export async function updateCalendarBlock(
  id: string, staffId: string, startTime: string,
  endTime: string, title: string, blockType: string
) {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_blocks").update({
    staff_id: staffId, start_time: startTime,
    end_time: endTime, title, block_type: blockType,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { success: true };
}

export async function updateCalendarBlockTimes(id: string, startTime: string, endTime: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_blocks").update({
    start_time: startTime, end_time: endTime,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { success: true };
}

export async function deleteCalendarBlock(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_blocks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { success: true };
}
