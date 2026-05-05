"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  dispatchAppointmentConfirmation,
  dispatchAppointmentUpdated,
  dispatchAppointmentCancelled,
  dispatchStaffOnTheWay,
  dispatchStaffArrived,
  dispatchPaymentPaid,
} from "@/lib/whatsapp/dispatch";

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
      ),
      reviews ( id, rating, comment, submitted_at )
    `)
    .eq("date", date)
    .neq("status", "cancelled")
    .order("time", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Mark the moment a review link was shared (via WhatsApp, etc.). Used
 * to show "Sent" state on the detail view so the owner doesn't double-send.
 */
export async function markReviewSent(appointmentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ review_sent_at: new Date().toISOString() })
    .eq("id", appointmentId);

  if (error) return { error: error.message };
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: true };
}

/**
 * Combined receipt + review share marker — bumps both timestamps in one
 * round-trip. Called after the owner taps "Send receipt + review" since
 * the wa.me message contains both links.
 */
export async function markShareSent(appointmentId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("appointments")
    .update({ review_sent_at: now, receipt_sent_at: now })
    .eq("id", appointmentId);

  if (error) return { error: error.message };
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: true };
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

export async function addClientQuick(name: string, phone: string, address: string, mapLink: string, notes: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      phone: phone || null,
      address: address || null,
      map_link: mapLink || null,
      notes: notes || null,
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

  // Fire-and-forget WhatsApp confirmation. Awaited so the send_log row
  // is written before we return — but failures don't fail the action.
  void dispatchAppointmentConfirmation(appointment.id);

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

  // Snapshot the BEFORE state so we can detect material changes (date,
  // time, or service list) and only fire the "updated" WhatsApp on a
  // real change. Pure note edits don't notify the customer.
  const { data: before } = await supabase
    .from("appointments")
    .select("date, time, appointment_services(service_id)")
    .eq("id", id)
    .single();
  const beforeServiceIds = (before?.appointment_services ?? [])
    .map((r: { service_id: string }) => r.service_id)
    .sort();
  const afterServiceIds = serviceEntries
    .map((e) => e.service_id)
    .sort();
  const materialChange =
    !before ||
    before.date !== date ||
    before.time !== time ||
    JSON.stringify(beforeServiceIds) !== JSON.stringify(afterServiceIds);

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

  if (materialChange) {
    void dispatchAppointmentUpdated(id);
  }

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

  // Status-driven WhatsApp notifications. Only fire on transition (not
  // when the status is re-set to the same value).
  if (current?.status !== status) {
    if (status === "on_the_way") {
      void dispatchStaffOnTheWay(id);
    } else if (status === "arrived") {
      void dispatchStaffArrived(id);
    } else if (status === "paid") {
      // recordPayment() should have minted both tokens by now, but the
      // dispatcher guards against missing tokens just in case.
      void dispatchPaymentPaid(id);
    }
  }

  revalidatePath("/calendar");
  return { success: true };
}

// ---- CANCEL ----

export async function cancelAppointment(id: string) {
  const supabase = await createClient();
  const { data: current } = await supabase.from("appointments").select("client_id, status").eq("id", id).single();
  const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: error.message };

  const { data: client } = current?.client_id
    ? await supabase.from("clients").select("name").eq("id", current.client_id).single()
    : { data: null };
  await logActivity(supabase, id, "cancelled",
    `${client?.name || "Unknown"}'s appointment was cancelled`);

  // Only notify on the cancellation *transition* — re-cancelling an
  // already-cancelled appointment shouldn't double-send.
  if (current?.status !== "cancelled") {
    void dispatchAppointmentCancelled(id);
  }

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

  // Drag-to-reschedule is a material change — notify the customer.
  if (current?.time !== newTime) {
    void dispatchAppointmentUpdated(id);
  }

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

// ---- BUNDLES FOR BOOKING ----

export async function getBundlesForBooking() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_bundles")
    .select("id, name, discount_type, discount_percentage, fixed_price, duration_override, service_bundle_items(id, service_id, sort_order, services:service_id(id, name, price, duration_minutes))")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return [];
  return data;
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

// Create one block row per selected staff member — same date/time/title/type.
// Each row is independent (edit/delete affects only that staff's block).
export async function createCalendarBlocksForStaff(
  staffIds: string[], date: string, startTime: string,
  endTime: string, title: string, blockType: string
) {
  if (!staffIds.length) return { error: "Select at least one staff member" };
  const supabase = await createClient();
  const rows = staffIds.map((sid) => ({
    staff_id: sid, date, start_time: startTime,
    end_time: endTime, title, block_type: blockType,
  }));
  const { error } = await supabase.from("calendar_blocks").insert(rows);
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

export async function getStaffSchedulesForDate(date: string) {
  const supabase = await createClient();
  const dayOfWeek = new Date(date + "T00:00:00").getDay(); // 0=Sunday

  const [schedResult, offResult] = await Promise.all([
    supabase
      .from("staff_schedules")
      .select("*")
      .eq("day_of_week", dayOfWeek),
    supabase
      .from("staff_days_off")
      .select("*")
      .eq("date", date),
  ]);

  return {
    schedules: schedResult.data ?? [],
    daysOff: offResult.data ?? [],
  };
}
